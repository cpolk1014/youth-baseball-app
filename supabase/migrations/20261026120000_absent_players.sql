-- Players marked absent for one game: left out of the field, the batting order and
-- auto-fill for that game only.
alter table public.lineup add column absent uuid[] not null default '{}';

-- Absent players must be on the team, and can't also be batting or sitting out.
create or replace function public.check_lineup_batting_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(new.batting_order || new.not_batting || new.absent) as b(player_id)
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
  if new.absent && (new.batting_order || new.not_batting) then
    raise exception 'an absent player cannot be in the batting order';
  end if;
  return new;
end;
$$;

drop trigger lineup_batting_order_check on public.lineup;
create trigger lineup_batting_order_check
before insert or update of batting_order, not_batting, absent, game_id on public.lineup
for each row execute function public.check_lineup_batting_order();

-- An absent player can't have a position in that game.
create or replace function public.check_lineup_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  game_team uuid;
  game_innings smallint;
  lineup_absent uuid[];
begin
  select s.team_id, g.innings, l.absent into game_team, game_innings, lineup_absent
  from public.lineup l
  join public.game g on g.id = l.game_id
  join public.season s on s.id = g.season_id
  where l.id = new.lineup_id;

  if new.inning > game_innings then
    raise exception 'inning % is beyond this %-inning game', new.inning, game_innings;
  end if;
  if not exists (select 1 from public.player p where p.id = new.player_id and p.team_id = game_team) then
    raise exception 'player % is not on this game''s team', new.player_id;
  end if;
  if new.player_id = any (lineup_absent) then
    raise exception 'player % is marked absent for this game', new.player_id;
  end if;
  return new;
end;
$$;

-- save_lineup gains p_absent (defaults to none).
drop function public.save_lineup(uuid, uuid[], jsonb, uuid[]);

create function public.save_lineup(
  p_game_id uuid,
  p_batting_order uuid[],
  p_slots jsonb,
  p_not_batting uuid[] default '{}',
  p_absent uuid[] default '{}'
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
    insert into public.lineup (game_id, batting_order, not_batting, absent)
    values (p_game_id, p_batting_order, p_not_batting, p_absent)
    returning id into v_lineup_id;
  else
    -- Clear slots first so the absent check on the new slots sees the new absent list.
    delete from public.lineup_slot where lineup_id = v_lineup_id;
    update public.lineup
    set batting_order = p_batting_order, not_batting = p_not_batting, absent = p_absent
    where id = v_lineup_id;
  end if;

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

revoke execute on function public.save_lineup(uuid, uuid[], jsonb, uuid[], uuid[]) from public, anon;
grant execute on function public.save_lineup(uuid, uuid[], jsonb, uuid[], uuid[]) to authenticated;
