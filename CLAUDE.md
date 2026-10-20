# CLAUDE.md — Youth Baseball Team App

## What this is

A mobile-first web app (PWA) that helps youth travel/select baseball teams (7U–14U) run their season: fair inning-by-inning lineups, playing-time tracking, printable umpire lineup cards, and team communication through GroupMe. Later: team finances, AI practice plans, stats import, tournament finder.

Positioning: "Run your travel team," not "another lineup app." Lineups are the hook; GroupMe integration, team finances and fair-play rules are the paid core. GameChanger is a data source, not a competitor to fight.

Primary users: head coach (lineups), team manager (comms), treasurer (money). The app is used **one-handed, on a phone, in a dugout, in sunlight**. Design for that: big tap targets, high contrast, minimal typing, fast.

## Stack

- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS
- Supabase: Postgres, Auth, Row Level Security, Storage, Realtime
- Vercel hosting (preview deploys per branch)
- Vitest for unit tests; Playwright for a few end-to-end flows
- Later: Stripe (billing), Claude API (structured JSON output) for AI features

## MVP scope (build only this until told otherwise)

1. Teams, seasons, roster (players: name, jersey #, preferred positions, can_pitch, can_catch)
2. Games (date, opponent, location, number of innings)
3. Inning-by-inning lineup builder: batting order + defensive position per player per inning, with live fair-play warnings
4. Participation tracking: season grid of innings per position (incl. bench), computed from saved lineups
5. Printable lineup card (umpire-ready PDF/print view; letter + half-sheet)
6. Post lineup / messages to the team's GroupMe group (OAuth per coach)

Out of scope for MVP: native chat, finances, stats import, AI features, tournament finder, branding, payments.

## Data model (initial)

- organization (optional parent of teams)
- team: name, age_group, colors, groupme_group_id
- season: team_id, name, start/end, fair_play_rules (JSONB)
- member: team_id, user_id, role (coach | manager | treasurer | parent)
- player: team_id, name, jersey_number, preferred_positions[], can_pitch, can_catch, active
- game: season_id, date, opponent, location, innings, status (scheduled | final)
- lineup: game_id, batting_order (player_id[]), version
- lineup_slot: lineup_id, inning, player_id, position (P, C, 1B, 2B, 3B, SS, LF, CF, RF, LCF, RCF, BENCH)

Participation is **derived** from lineup_slot rows on final games, never stored separately.

## Fair-play rules engine (core logic — keep it pure and tested)

Lives in `src/lib/rules/`. Pure TypeScript functions, no I/O, no React. Input: roster + lineup + rule config + season history. Output: list of violations `{ rule, playerId, inning?, severity: 'warn' | 'block', message }`.

Rules are configurable per season. Defaults:

- Every position filled exactly once per inning; no player in two positions in one inning
- Max consecutive bench innings: 1
- Nobody sits twice before everyone has sat once
- Each player plays at least one infield inning per game (configurable)
- No player at the same position more than N innings per game (default 2)
- Only can_pitch players pitch; only can_catch players catch
- Pitcher/catcher limits: max innings pitched per game; a catcher can't pitch in the same game (configurable, league rules vary)
- Season balance (warn only): flag players far below team average for infield innings or far above for bench innings

An auto-generate function proposes a full valid lineup satisfying all `block` rules and minimizing `warn`s, using season history for balance. It must be deterministic for a given seed (testable).

## Conventions

- Write tests first for anything in `src/lib/rules/`. Aim for full coverage there.
- Server-side data access through Supabase with RLS; never trust the client for team membership.
- All secrets in env vars; never commit keys. `.env.example` lists every variable.
- Small, focused commits. Run typecheck, lint and tests before saying a task is done.
- Mobile-first UI; check every screen at 375px width.
- Ask before adding a new dependency that isn't in the stack above.

## Youth safety (non-negotiable)

- No private messaging between adults and minors in anything we build.
- Players are minors: collect the minimum data (no player emails/phones in MVP).
- Messages go to team groups, not individual kids.

## GroupMe

Public API (https://dev.groupme.com), OAuth implicit flow per coach. Wrap all calls in `src/lib/groupme/` behind an interface so another channel (SMS, email) can be added. Phase 2: mirror the group's conversation in-app via GroupMe's push service.
