-- A player's link to a kid's own record (player.athlete_id) is set only by the database:
-- when a parent links (ensure_athlete) and when a parent joins or splits records
-- (link_player_athlete, split_player_athlete). Security review H3: before this, a coach of
-- any team, even one they just made, could point a player at another team's kid's record,
-- then read it and write fake stats and pitch counts into it.

create function public.lock_player_athlete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Runs as the person (security invoker): the database's own functions run as the owner.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.athlete_id := null;
  elsif new.athlete_id is distinct from old.athlete_id then
    raise exception 'A player''s record is linked by their parents, not edited directly.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger lock_player_athlete
  before insert or update on public.player
  for each row execute function public.lock_player_athlete();
