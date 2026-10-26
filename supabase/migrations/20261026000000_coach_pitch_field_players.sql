-- Coach's pitch teams, 9- or 10-fielder games, and players left out of the batting order.

-- Coach's pitch: the kid at P fields but doesn't pitch, so pitching rules don't apply,
-- and new games default to 10 fielders.
alter table public.team add column coach_pitch boolean not null default false;

-- 9 fielders: LF CF RF. 10 fielders: LF LCF RCF RF.
alter table public.game
  add column field_players smallint not null default 9 check (field_players in (9, 10));

-- Players sitting out of the batting order for this game (they can still play the field).
alter table public.lineup add column not_batting uuid[] not null default '{}';

-- The batting-order trigger now also checks not_batting, and a player can't be in both.
create or replace function public.check_lineup_batting_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(new.batting_order || new.not_batting) as b(player_id)
    where not exists (
      select 1
      from public.player p
      join public.season s on s.team_id = p.team_id
      join public.game g on g.season_id = s.id
      where p.id = b.player_id and g.id = new.game_id
    )
  ) then
    raise exception 'batting order includes a player who is not on this game''s team';
  end if;
  if new.batting_order && new.not_batting then
    raise exception 'a player cannot be both batting and not batting';
  end if;
  return new;
end;
$$;

drop trigger lineup_batting_order_check on public.lineup;
create trigger lineup_batting_order_check
before insert or update of batting_order, not_batting, game_id on public.lineup
for each row execute function public.check_lineup_batting_order();

-- save_lineup gains p_not_batting (defaults to none).
drop function public.save_lineup(uuid, uuid[], jsonb);

create function public.save_lineup(
  p_game_id uuid,
  p_batting_order uuid[],
  p_slots jsonb,
  p_not_batting uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lineup_id uuid;
begin
  if not public.has_team_role(public.game_team_id(p_game_id), '{coach}') then
    raise exception 'only a coach can save this lineup' using errcode = '42501';
  end if;

  select id into v_lineup_id
  from public.lineup
  where game_id = p_game_id
  order by version desc
  limit 1
  for update;

  if v_lineup_id is null then
    insert into public.lineup (game_id, batting_order, not_batting)
    values (p_game_id, p_batting_order, p_not_batting)
    returning id into v_lineup_id;
  else
    update public.lineup
    set batting_order = p_batting_order, not_batting = p_not_batting
    where id = v_lineup_id;
  end if;

  delete from public.lineup_slot where lineup_id = v_lineup_id;
  insert into public.lineup_slot (lineup_id, inning, player_id, position)
  select
    v_lineup_id,
    (s ->> 'inning')::smallint,
    (s ->> 'player_id')::uuid,
    (s ->> 'position')::public.lineup_position
  from jsonb_array_elements(p_slots) as s;

  return v_lineup_id;
end;
$$;

revoke execute on function public.save_lineup(uuid, uuid[], jsonb, uuid[]) from public, anon;
grant execute on function public.save_lineup(uuid, uuid[], jsonb, uuid[]) to authenticated;
