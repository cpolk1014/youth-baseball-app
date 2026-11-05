-- Families pay for their kids' stats, so nothing a coach does takes them away: a coach
-- removing a parent's link to a kid (fixing links on Coaches & parents) only unlinks them on
-- that team. Only a parent unlinking themselves ends their access to the kid's history.
create or replace function public.drop_athlete_guardian()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete uuid;
begin
  if coalesce(current_setting('rallycap.keep_athletes', true), '') = 'on' then
    return old;
  end if;
  -- Someone else (a coach or manager) removed the link: the family keeps the history.
  if old.user_id is distinct from (select auth.uid()) then
    return old;
  end if;
  -- The player itself is being deleted (its team went away): keep the history.
  select athlete_id into v_athlete from public.player where id = old.player_id;
  if not found or v_athlete is null then
    return old;
  end if;
  if not exists (
    select 1 from public.player_guardian g join public.player p on p.id = g.player_id
    where g.user_id = old.user_id and p.athlete_id = v_athlete and g.id <> old.id
  ) then
    delete from public.athlete_guardian where athlete_id = v_athlete and user_id = old.user_id;
  end if;
  return old;
end;
$$;
