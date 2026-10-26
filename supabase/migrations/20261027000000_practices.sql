-- Practice schedule: a season's practices, each with a focus and a drill plan.
create table public.practice (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.season (id) on delete cascade,
  practice_date date not null,
  start_time time,
  end_time time,
  location text,
  focus text check (focus is null or length(focus) <= 60),
  notes text check (notes is null or length(notes) <= 2000),
  -- Ordered drills: [{ "id", "title", "minutes", "notes"? }]
  plan jsonb not null default '[]' check (jsonb_typeof(plan) = 'array'),
  canceled boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time > start_time)
);

create index on public.practice (season_id, practice_date);

alter table public.practice enable row level security;

-- Everyone on the team can see practices; coaches and managers plan them.
create policy "members can read practices" on public.practice
  for select to authenticated using (public.is_team_member(public.season_team_id(season_id)));
create policy "coaches and managers can add practices" on public.practice
  for insert to authenticated
  with check (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
create policy "coaches and managers can edit practices" on public.practice
  for update to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'))
  with check (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
create policy "coaches and managers can delete practices" on public.practice
  for delete to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
