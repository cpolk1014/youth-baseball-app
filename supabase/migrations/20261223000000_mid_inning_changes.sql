-- Mid-inning changes: a kid can play more than one spot in an inning (a pitching change after
-- 1 out moves CF to P, LF to CF, P to LF). Each lineup slot now covers part of an inning by
-- outs, [from_out, to_out): 0 to 3 is the whole inning, which every existing slot keeps. A
-- change when the coach wasn't sure of the outs counts as halfway (1.5) and is `estimated`.
-- Playing time counts each slot's share of the 3 outs.

alter table public.lineup_slot
  add column from_out numeric(2, 1) not null default 0,
  add column to_out numeric(2, 1) not null default 3,
  add column estimated boolean not null default false,
  add constraint lineup_slot_outs check (
    from_out in (0, 1, 1.5, 2) and to_out in (1, 1.5, 2, 3) and from_out < to_out
  );

-- One row per kid per part of an inning (was one per kid per inning).
alter table public.lineup_slot drop constraint lineup_slot_pkey;
alter table public.lineup_slot add primary key (lineup_id, inning, player_id, from_out);

-- Saving a lineup takes each slot's outs (none = the whole inning) and refuses a kid in two
-- spots at the same moment.
create or replace function public.save_lineup(
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
  v_clash record;
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

  insert into public.lineup_slot (lineup_id, inning, player_id, position, from_out, to_out, estimated)
  select
    v_lineup_id,
    (s ->> 'inning')::smallint,
    (s ->> 'player_id')::uuid,
    (s ->> 'position')::public.lineup_position,
    coalesce((s ->> 'from_out')::numeric, 0),
    coalesce((s ->> 'to_out')::numeric, 3),
    coalesce((s ->> 'estimated')::boolean, false)
  from jsonb_array_elements(p_slots) as s;

  select a.inning, a.player_id into v_clash
  from public.lineup_slot a
  join public.lineup_slot b
    on b.lineup_id = a.lineup_id and b.inning = a.inning and b.player_id = a.player_id
    and b.from_out > a.from_out and b.from_out < a.to_out
  where a.lineup_id = v_lineup_id
  limit 1;
  if v_clash.player_id is not null then
    raise exception 'A player is in two spots at once in inning %.', v_clash.inning
      using errcode = 'unique_violation';
  end if;

  return v_lineup_id;
end;
$$;

-- Season playing time by position counts each slot's share of the inning (thirds).
drop view public.player_participation;
create view public.player_participation with (security_invoker = true) as
select
  g.season_id,
  ls.player_id,
  ls.position,
  round(sum((ls.to_out - ls.from_out) / 3.0), 4) as innings
from public.current_lineup cl
join public.game g on g.id = cl.game_id and g.status = 'final'
join public.lineup_slot ls on ls.lineup_id = cl.id and ls.inning <= g.innings
group by g.season_id, ls.player_id, ls.position;
