-- Season stats imported from GameChanger's team stats export (CSV). One document per
-- season: each import replaces the last. Only coaches (and owners) and managers can see
-- or change them; parents and treasurers never see stats.

create table public.team_stats (
  season_id uuid primary key references public.season (id) on delete cascade,
  file_name text not null check (length(file_name) between 1 and 200),
  -- { columns: [{group, key, description}], players: [{number, first, last, values,
  --   playerId}], totals: [...] | null }
  data jsonb not null check (
    jsonb_typeof(data) = 'object'
    and jsonb_typeof(data -> 'columns') = 'array'
    and jsonb_typeof(data -> 'players') = 'array'
    and octet_length(data::text) < 500000
  ),
  imported_by uuid default auth.uid() references auth.users (id) on delete set null,
  imported_at timestamptz not null default now()
);

alter table public.team_stats enable row level security;

create policy "coaches and managers see stats" on public.team_stats
  for select to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
create policy "coaches and managers import stats" on public.team_stats
  for insert to authenticated
  with check (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
create policy "coaches and managers replace stats" on public.team_stats
  for update to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'))
  with check (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
create policy "coaches and managers clear stats" on public.team_stats
  for delete to authenticated
  using (public.has_team_role(public.season_team_id(season_id), '{coach,manager}'));
