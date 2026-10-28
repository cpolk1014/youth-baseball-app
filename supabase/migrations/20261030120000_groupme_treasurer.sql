-- Treasurers post new Bat Arounds to the team's GroupMe, so they can use (see) the team's
-- bot too. Connecting or changing the bot stays with coaches and managers; parents still
-- never see it.
drop policy if exists "coaches and managers see the team's GroupMe bot" on public.team_groupme;
drop policy if exists "coaches, managers and treasurers see the team's GroupMe bot" on public.team_groupme;
create policy "coaches, managers and treasurers see the team's GroupMe bot" on public.team_groupme
  for select to authenticated
  using (public.has_team_role(team_id, '{coach,manager,treasurer}'));
