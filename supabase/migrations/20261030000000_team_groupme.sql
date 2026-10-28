-- GroupMe: each team can connect one GroupMe bot (created in the team's group on
-- dev.groupme.com). Posting goes through the app's server, which reads the bot ID as the
-- signed-in user. Anyone holding a bot ID can post as the bot, so only coaches and managers
-- (who run team communication) can see or change it; parents never see it.

create table public.team_groupme (
  team_id uuid primary key references public.team (id) on delete cascade,
  bot_id text not null check (bot_id ~ '^[A-Za-z0-9]{10,64}$'),
  group_name text check (group_name is null or length(trim(group_name)) between 1 and 80),
  connected_by uuid default auth.uid() references auth.users (id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.team_groupme enable row level security;

create policy "coaches and managers see the team's GroupMe bot" on public.team_groupme
  for select to authenticated using (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers connect GroupMe" on public.team_groupme
  for insert to authenticated with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers change GroupMe" on public.team_groupme
  for update to authenticated
  using (public.has_team_role(team_id, '{coach,manager}'))
  with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers disconnect GroupMe" on public.team_groupme
  for delete to authenticated using (public.has_team_role(team_id, '{coach,manager}'));
