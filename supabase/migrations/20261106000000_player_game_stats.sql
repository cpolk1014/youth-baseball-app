-- A kid's own game stats, imported by their parent from a GameChanger box score (only that
-- kid's line is kept; the file isn't stored). Only the kid's linked parents can add, see or
-- remove them: not coaches, not other families.

create table public.player_game_stat (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.player (id) on delete cascade,
  season_id uuid references public.season (id) on delete set null,
  game_date date not null,
  opponent text not null check (length(trim(opponent)) between 1 and 80),
  -- The kid's team's runs and the opponent's (null if the box score didn't show them).
  our_runs smallint check (our_runs between 0 and 99),
  their_runs smallint check (their_runs between 0 and 99),
  -- How the box score named the team and the kid, for the parent to recognize it.
  team_name text check (team_name is null or length(team_name) <= 80),
  box_name text check (box_name is null or length(box_name) <= 60),
  -- {ab, r, h, rbi, bb, so, doubles, triples, hr, sb, cs, hbp, sac, sf}
  batting jsonb not null check (jsonb_typeof(batting) = 'object' and octet_length(batting::text) < 1000),
  -- {outs, h, r, er, bb, so, pitches, strikes, bf}, or null when they didn't pitch
  pitching jsonb check (
    pitching is null or (jsonb_typeof(pitching) = 'object' and octet_length(pitching::text) < 1000)
  ),
  errors smallint not null default 0 check (errors between 0 and 30),
  positions text[] not null default '{}' check (cardinality(positions) <= 12),
  imported_by uuid default auth.uid() references auth.users (id) on delete set null,
  imported_at timestamptz not null default now(),
  -- Importing the same game again replaces it.
  unique (player_id, game_date, opponent)
);

create index on public.player_game_stat (player_id, game_date);

alter table public.player_game_stat enable row level security;

create policy "parents see their kid's game stats" on public.player_game_stat
  for select to authenticated using (public.is_guardian_of(player_id));
create policy "parents add their kid's game stats" on public.player_game_stat
  for insert to authenticated with check (public.is_guardian_of(player_id));
create policy "parents fix their kid's game stats" on public.player_game_stat
  for update to authenticated
  using (public.is_guardian_of(player_id))
  with check (public.is_guardian_of(player_id));
create policy "parents remove their kid's game stats" on public.player_game_stat
  for delete to authenticated using (public.is_guardian_of(player_id));
