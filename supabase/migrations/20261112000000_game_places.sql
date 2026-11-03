-- Game places: a location picked from Google Maps (name, address, map position, place id)
-- and the field within it ("Traction Sports Complex" · "Chabills Field").

alter table public.game
  add column field text check (field is null or length(trim(field)) between 1 and 60),
  add column location_address text check (location_address is null or length(location_address) <= 200),
  add column location_lat double precision check (location_lat is null or location_lat between -90 and 90),
  add column location_lng double precision check (location_lng is null or location_lng between -180 and 180),
  add column location_place_id text check (location_place_id is null or length(location_place_id) <= 300);

-- Game day posts name the field too.
create or replace function public.game_day_message(p_team_id uuid, p_date date, p_same_day boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.team;
  g record;
  n int := 0;
  times text[] := '{}';
  opponents text[] := '{}';
  places text[] := '{}';
  uniforms text[] := '{}';
  per_place text[] := '{}';
  per_uniform text[] := '{}';
  first_time time;
  first_arrive time;
  day_word text := to_char(p_date, 'FMDay');
  lines text[] := '{}';
  head text;
begin
  if auth.uid() is not null and not public.has_team_role(p_team_id, '{coach,manager}') then
    raise exception 'only coaches and managers can preview game day posts'
      using errcode = 'insufficient_privilege';
  end if;
  select * into t from public.team where id = p_team_id;
  if not found then return null; end if;

  for g in
    select gm.start_time, gm.arrive_time, nullif(trim(gm.opponent), '') as opponent,
      nullif(concat_ws(' · ', nullif(trim(gm.location), ''), nullif(trim(gm.field), '')), '') as location,
      coalesce(
        u.name,
        nullif(concat_ws(' · ',
          (gm.uniform_custom ->> 'shirt') || ' shirt', (gm.uniform_custom ->> 'pants') || ' pants',
          (gm.uniform_custom ->> 'hat') || ' hat', (gm.uniform_custom ->> 'belt') || ' belt',
          (gm.uniform_custom ->> 'socks') || ' socks'), '')
      ) as uniform
    from public.game gm
    join public.season s on s.id = gm.season_id
    left join public.uniform_combo u on u.id = gm.uniform_combo_id
    where s.team_id = p_team_id and gm.game_date = p_date and gm.status = 'scheduled'
    order by gm.start_time nulls last, gm.created_at
  loop
    n := n + 1;
    if n = 1 then
      first_time := g.start_time;
      first_arrive := coalesce(
        g.arrive_time,
        case when g.start_time is not null and t.arrive_minutes is not null
          then g.start_time - make_interval(mins => t.arrive_minutes) end
      );
    end if;
    times := times || coalesce(public.game_post_time_text(g.start_time), 'time TBD');
    if g.opponent is not null and not g.opponent = any (opponents) then
      opponents := opponents || g.opponent;
    end if;
    places := places || coalesce(g.location, '');
    uniforms := uniforms || coalesce(g.uniform, '');
    per_place := per_place
      || (coalesce(public.game_post_time_text(g.start_time), 'TBD') || ': ' || coalesce(g.location, 'place TBD'));
    per_uniform := per_uniform
      || (coalesce(public.game_post_time_text(g.start_time), 'TBD') || ': ' || coalesce(g.uniform, 'not set'));
  end loop;
  if n = 0 then return null; end if;

  if n = 1 then
    head := case when p_same_day then 'Game' else day_word || ' game' end;
    if array_length(opponents, 1) = 1 then head := head || ' against ' || opponents[1]; end if;
  else
    head := case when p_same_day then 'Games ' else day_word || ' games ' end
      || public.game_post_and(times);
    if coalesce(array_length(opponents, 1), 0) > 0 then
      head := head || ' against ' || public.game_post_and(opponents);
    end if;
  end if;
  lines := lines || head;

  -- Where: one line when every game is at the same place, else one per game.
  if (select count(distinct x) from unnest(places) x) = 1 then
    if places[1] <> '' then lines := lines || places[1]; end if;
  else
    lines := lines || per_place;
  end if;

  if n = 1 then lines := lines || coalesce(public.game_post_time_text(first_time), 'Time TBD'); end if;
  if first_arrive is not null then
    lines := lines || ('Arrive by ' || public.game_post_time_text(first_arrive));
  end if;

  -- What to wear: one line when every game matches, else one per game.
  if (select count(distinct x) from unnest(uniforms) x) = 1 then
    if uniforms[1] <> '' then lines := lines || uniforms[1]; end if;
  else
    lines := lines || per_uniform;
  end if;

  return left(array_to_string(lines, E'\n'), 1000);
end;
$$;
