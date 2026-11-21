-- Parent links, tightened (security review H2). Before: anyone on a team could link themselves
-- to any kid, which opened that kid's pitch log, other teams and family money to them.
-- Now a person links themselves only to a kid nobody is linked to yet (the first parent);
-- anyone else (a second parent, a fix) is linked by a coach or manager. And when a coach or
-- manager removes someone's link, that person keeps the kid's history only if they paid for
-- it (a Player pass covering the kid).

-- Whether any family is linked to a player (parents can't see other families' link rows).
create function public.player_has_guardian(p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.player_guardian g where g.player_id = p_player);
$$;
revoke execute on function public.player_has_guardian(uuid) from public, anon;
grant execute on function public.player_has_guardian(uuid) to authenticated;

drop policy "members link themselves, coaches link anyone on the team" on public.player_guardian;
create policy "first parent links themselves, coaches link anyone on the team"
  on public.player_guardian
  for insert to authenticated with check (
    (
      user_id = (select auth.uid())
      and public.is_team_member(public.player_team_id(player_id))
      and not public.player_has_guardian(player_id)
    )
    or (
      user_id <> (select auth.uid())
      and public.has_team_role(public.player_team_id(player_id), '{coach,manager}')
      and exists (
        select 1 from public.member m
        where m.user_id = player_guardian.user_id
          and m.team_id = public.player_team_id(player_guardian.player_id)
      )
    )
  );

-- A coach or manager removing someone's link ends that person's access to the kid's history,
-- unless they bought a Player pass for the kid (then the history they paid for stays).
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
  -- The player itself is being deleted (its team went away): keep the history.
  select athlete_id into v_athlete from public.player where id = old.player_id;
  if not found or v_athlete is null then
    return old;
  end if;
  -- Someone else removed the link: a family that paid for the kid keeps the history.
  if old.user_id is distinct from (select auth.uid()) and exists (
    select 1 from public.family_pass_athlete fa
    join public.family_pass f on f.id = fa.pass_id
    where fa.athlete_id = v_athlete and f.buyer = old.user_id
  ) then
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
