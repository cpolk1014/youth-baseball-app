-- How a game's lineup was built: fair play (the default) or competitive (from the
-- season's GameChanger stats). Saved with the game so "Why this lineup?" explains it.

alter table public.game
  add column lineup_style text not null default 'fair'
    check (lineup_style in ('fair', 'competitive'));
