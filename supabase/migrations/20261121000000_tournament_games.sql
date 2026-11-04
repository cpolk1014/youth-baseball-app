-- Tournaments, phase 2: the pool schedule and bracket, read from screenshots. Every game in
-- our division lives with the tournament; the games we play are also team games (game_id),
-- so lineups, the game day post and the rest work as usual.

create table public.tournament_game (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournament (id) on delete cascade,
  game_no text check (game_no is null or length(game_no) <= 20),
  stage text not null default 'pool' check (stage in ('pool', 'bracket')),
  pool text check (pool is null or length(pool) <= 40),
  round text check (round is null or length(round) <= 40),
  game_date date,
  start_time time,
  venue text check (venue is null or length(venue) <= 80),
  field text check (field is null or length(field) <= 80),
  -- Team names, or a bracket placeholder until seeding ("1st Pool A", "Winner G7").
  home text not null check (length(trim(home)) between 1 and 120),
  away text not null check (length(trim(away)) between 1 and 120),
  home_team_id uuid references public.tournament_team (id) on delete set null,
  away_team_id uuid references public.tournament_team (id) on delete set null,
  -- Our games: the team game it's linked to.
  game_id uuid references public.game (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.tournament_game (tournament_id);
create unique index tournament_game_game on public.tournament_game (game_id) where game_id is not null;

alter table public.tournament_game enable row level security;

create policy "team members see tournament games" on public.tournament_game
  for select to authenticated
  using (public.is_team_member(public.tournament_owner_team(tournament_id)));
-- Coaches and managers change them; a linked game must be one of the same team's games.
create policy "coaches and managers add tournament games" on public.tournament_game
  for insert to authenticated
  with check (
    public.has_team_role(public.tournament_owner_team(tournament_id), '{coach,manager}')
    and (game_id is null or public.game_team_id(game_id) = public.tournament_owner_team(tournament_id))
  );
create policy "coaches and managers change tournament games" on public.tournament_game
  for update to authenticated
  using (public.has_team_role(public.tournament_owner_team(tournament_id), '{coach,manager}'))
  with check (
    public.has_team_role(public.tournament_owner_team(tournament_id), '{coach,manager}')
    and (game_id is null or public.game_team_id(game_id) = public.tournament_owner_team(tournament_id))
  );
create policy "coaches and managers remove tournament games" on public.tournament_game
  for delete to authenticated
  using (public.has_team_role(public.tournament_owner_team(tournament_id), '{coach,manager}'));
