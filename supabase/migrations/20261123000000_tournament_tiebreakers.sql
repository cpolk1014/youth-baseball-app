-- Tournaments, phase 4: tie-breakers, standings and seeding. A coach reads an organization's
-- tie-break rules from a screenshot and saves them with a name ("2D Tiebreak") to reuse at
-- that organization's other tournaments. Standings are worked out in the app from the pool
-- games' scores; when pool play is done the coach locks the seeds (they stop moving, the
-- bracket fills in, and the team's GroupMe can hear about it).

create table public.tiebreak_rule_set (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.team (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  organization text check (organization is null or length(organization) <= 80),
  -- Ordered criteria: [{ type, cap?, text }] (see src/lib/tournaments/tiebreak.ts).
  rules jsonb not null default '[]' check (jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) <= 12),
  -- Once a tie is partly broken, the teams still tied start over at the first criterion.
  restart boolean not null default true,
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index on public.tiebreak_rule_set (team_id);
create unique index tiebreak_rule_set_name on public.tiebreak_rule_set (team_id, lower(trim(name)));

alter table public.tiebreak_rule_set enable row level security;

create policy "team members see tie-break rules" on public.tiebreak_rule_set
  for select to authenticated using (public.is_team_member(team_id));
create policy "coaches and managers add tie-break rules" on public.tiebreak_rule_set
  for insert to authenticated with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers change tie-break rules" on public.tiebreak_rule_set
  for update to authenticated
  using (public.has_team_role(team_id, '{coach,manager}'))
  with check (public.has_team_role(team_id, '{coach,manager}'));
create policy "coaches and managers remove tie-break rules" on public.tiebreak_rule_set
  for delete to authenticated using (public.has_team_role(team_id, '{coach,manager}'));

alter table public.tournament
  add column tiebreak_set_id uuid references public.tiebreak_rule_set (id) on delete set null,
  -- Seeds across all pool games, or within each pool.
  add column seeding text not null default 'overall' check (seeding in ('overall', 'pool')),
  -- The locked seeds: [{ teamId, seed, pool? }] in order.
  add column seeds jsonb check (seeds is null or (jsonb_typeof(seeds) = 'array' and jsonb_array_length(seeds) <= 64)),
  add column seeds_locked_at timestamptz;

-- A tournament can only use its own team's rule sets.
create function public.check_tournament_tiebreak()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tiebreak_set_id is not null and not exists (
    select 1 from public.tiebreak_rule_set where id = new.tiebreak_set_id and team_id = new.team_id
  ) then
    raise exception 'That tie-break rule set belongs to another team.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tournament_tiebreak_team
  before insert or update of tiebreak_set_id on public.tournament
  for each row execute function public.check_tournament_tiebreak();
