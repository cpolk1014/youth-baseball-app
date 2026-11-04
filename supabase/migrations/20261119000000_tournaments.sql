-- Tournaments, phase 1: a coach adds a tournament from its event link (or a screenshot of
-- the team list); RallyCap reads the event and the teams in the coach's division, and a
-- weekly job re-reads the link for teams that sign up later. Each team keeps its own copy.

create table public.tournament (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  season_id uuid references public.season (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  organization text check (organization is null or length(organization) <= 80),
  url text check (url is null or (url ~ '^https://' and length(url) <= 500)),
  start_date date,
  end_date date check (end_date is null or start_date is null or end_date >= start_date),
  city text check (city is null or length(city) <= 80),
  venues text[] not null default '{}' check (cardinality(venues) <= 20),
  division text check (division is null or length(division) <= 40),
  -- The weekly check: when it last ran, a fingerprint of the page, and what it found.
  checked_at timestamptz,
  page_hash text check (page_hash is null or length(page_hash) <= 100),
  check_note text check (check_note is null or length(check_note) <= 200),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index on public.tournament (team_id);

create table public.tournament_team (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournament (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  hometown text check (hometown is null or length(hometown) <= 80),
  class_label text check (class_label is null or length(class_label) <= 60),
  -- Our own team in the tournament (at most one).
  is_us boolean not null default false,
  source text not null default 'link' check (source in ('link', 'screenshot', 'manual', 'weekly')),
  added_at timestamptz not null default now()
);

create unique index tournament_team_name on public.tournament_team (tournament_id, lower(trim(name)));
create unique index tournament_team_us on public.tournament_team (tournament_id) where is_us;

create function public.tournament_owner_team(p_tournament_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_id from public.tournament where id = p_tournament_id;
$$;

revoke execute on function public.tournament_owner_team(uuid) from public, anon;
grant execute on function public.tournament_owner_team(uuid) to authenticated;

alter table public.tournament enable row level security;
alter table public.tournament_team enable row level security;

create policy "team members see their tournaments" on public.tournament
  for select to authenticated using (public.is_team_member(team_id));
create policy "coaches and managers add tournaments" on public.tournament
  for insert to authenticated with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers change tournaments" on public.tournament
  for update to authenticated
  using (public.has_team_role(team_id, '{coach,manager}'))
  with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers remove tournaments" on public.tournament
  for delete to authenticated using (public.has_team_role(team_id, '{coach,manager}'));

create policy "team members see tournament teams" on public.tournament_team
  for select to authenticated
  using (public.is_team_member(public.tournament_owner_team(tournament_id)));
create policy "coaches and managers add tournament teams" on public.tournament_team
  for insert to authenticated
  with check (public.has_team_role(public.tournament_owner_team(tournament_id), '{coach,manager}'));
create policy "coaches and managers change tournament teams" on public.tournament_team
  for update to authenticated
  using (public.has_team_role(public.tournament_owner_team(tournament_id), '{coach,manager}'))
  with check (public.has_team_role(public.tournament_owner_team(tournament_id), '{coach,manager}'));
create policy "coaches and managers remove tournament teams" on public.tournament_team
  for delete to authenticated
  using (public.has_team_role(public.tournament_owner_team(tournament_id), '{coach,manager}'));
