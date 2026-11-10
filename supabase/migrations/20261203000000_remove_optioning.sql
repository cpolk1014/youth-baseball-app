-- Teams are no longer "optioned" by coaches. Coaches can delete a team at any time (the app
-- warns that it's permanent); teams whose season or free time has run out show as Expired.
-- Any team optioned before this goes back to being a normal team.
update public.team set optioned_at = null where optioned_at is not null;

drop policy "coaches can delete optioned teams" on public.team;
create policy "coaches can delete teams" on public.team
  for delete to authenticated
  using (public.has_team_role(id, '{coach}'));

-- The caller's teams with no season or free time left as of today. A season ends July 31, so
-- the grace days after it count as expired here even though the team keeps working.
create function public.my_expired_teams()
returns table (team_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.team_id
  from public.member m
  join public.team t on t.id = m.team_id
  where m.user_id = (select auth.uid())
    and not coalesce(t.free_until >= current_date, false)
    and not exists (
      select 1 from public.team_pass p where p.team_id = m.team_id and p.expires_on >= current_date
    )
    and not exists (
      select 1 from public.club_code c where c.team_id = m.team_id and c.expires_on >= current_date
    )
  group by m.team_id
$$;
revoke execute on function public.my_expired_teams() from public, anon;
grant execute on function public.my_expired_teams() to authenticated;
