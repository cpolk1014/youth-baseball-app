-- Save a game's lineup in one transaction: batting order + every slot, replacing the
-- current version in place (or creating version 1). Runs as the caller, so RLS and the
-- lineup_slot triggers still apply; only coaches can save.
create function public.save_lineup(p_game_id uuid, p_batting_order uuid[], p_slots jsonb)
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
    insert into public.lineup (game_id, batting_order)
    values (p_game_id, p_batting_order)
    returning id into v_lineup_id;
  else
    update public.lineup set batting_order = p_batting_order where id = v_lineup_id;
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

revoke execute on function public.save_lineup(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.save_lineup(uuid, uuid[], jsonb) to authenticated;
