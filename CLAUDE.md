# CLAUDE.md — RallyCap (youth baseball team app)

## What this is

**RallyCap** (rallycap.team). A mobile-first web app (PWA) that helps youth travel/select baseball teams (7U–14U) run their season: fair inning-by-inning lineups, playing-time tracking, printable umpire lineup cards, and team communication through GroupMe. Later: team finances, AI practice plans, stats import, tournament finder.

Positioning: "Run your travel team," not "another lineup app." Lineups are the hook; GroupMe integration, team finances and fair-play rules are the paid core. GameChanger is a data source, not a competitor to fight.

Primary users: head coach (lineups), team manager (comms), treasurer (money). The app is used **one-handed, on a phone, in a dugout, in sunlight**. Design for that: big tap targets, high contrast, minimal typing, fast.

## Stack

- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS
- Supabase: Postgres, Auth, Row Level Security, Storage, Realtime
- Vercel hosting (preview deploys per branch)
- Vitest for unit tests; Playwright for a few end-to-end flows
- Claude API (`@anthropic-ai/sdk`, structured JSON output) for AI features, server-side only (`ANTHROPIC_API_KEY`); schedule import uses it
- Later: Stripe (billing)

## Features

The MVP gate is lifted: keep shipping features. Update this list as things ship.

**Shipped** (live at rallycap.team)

- Teams, seasons, roster (name, jersey #, preferred positions, can pitch/catch, active); coach's pitch teams
- Games (date, time, opponent, location, innings, 9 or 10 fielders); mark final / reopen
- Inning-by-inning lineup builder with live fair-play warnings, Auto-fill, batting order with sit-outs, per-game attendance
- Season participation grid (summary and by position), fair to players who miss games
- Printable lineup card (half sheet ×2, full letter)
- Magic-link + code sign-in, invite links, roles (coach / manager / parent read-only), multiple teams with a switcher
- Parents linked to their kids (parent picks on first open; coaches/managers fix links on Coaches & parents); homework uses the links
- Option a team (archive, read-only, "Call Up" to restore); delete only optioned teams
- Installable on a phone's home screen; responsive layout (phone: bottom tabs; tablet: two-column lists, centered dialogs; desktop: side menu)
- Practice schedule: build a season of practices (days × dates), each with a focus, a drill plan (starter library or custom, minutes vs. scheduled length), notes, cancel; parents view
- Import a schedule from a photo, PDF or CSV (Claude reads it; coach reviews before adding practices and games)
- Plays tab ("Where do I go?"): 57 animated situational plays with every position's job; random quizzes; coaches assign plays as homework to families and see who finished; plays can be added to a practice as situations to work on

**Next up** (roughly in order; the user picks)

- Post lineups / messages to the team's GroupMe group (OAuth per coach)
- Team finances: dues per family, who's paid, expenses (no in-app payments at first)
- Tournament finder
- Offline use in the dugout (local copy, sync when back online)

**Later:** in-app payments (Stripe), AI practice plans, stats import (GameChanger), native chat.

## Data model

Source of truth: `supabase/migrations/`. Summary:

- organization (optional parent of teams)
- team: name, age_group, colors, groupme_group_id, coach_pitch, optioned_at (archived; delete only when set)
- season: team_id, name, start/end, fair_play_rules (JSONB, RuleConfig overrides)
- member: team_id, user_id, role (coach | manager | treasurer | parent), display_name (no emails stored)
- player_guardian: player_id, user_id (parent ↔ kid links; families see their own, coaches/managers all; dropped when the member leaves)
- invite: team_id, role, token, expires_at, max_uses, uses, revoked_at (coach-only; joined via `accept_invite`)
- player: team_id, name, jersey_number, preferred_positions[], can_pitch, can_catch, active
- game: season_id, date, start_time, opponent, location, innings, field_players (9 | 10), status (scheduled | final)
- lineup: game_id, batting_order (player_id[]), not_batting[], absent[], version (saved via `save_lineup`)
- practice: season_id, practice_date, start_time, end_time, location, focus, notes, plan (JSONB drills), canceled, plays (library play ids)
- play_assignment: team_id, title, play_ids[], due_date (homework; plays live in code, `src/lib/plays/`)
- quiz_result: assignment_id, user_id, player_id?, correct, total (families see their own; coaches/managers see all)
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
- Mobile-first UI; check every screen at 375px width, and at tablet (768px) and desktop (1440px) for layout changes.
- Ask before adding a new dependency that isn't in the stack above.

## Youth safety (non-negotiable)

- No private messaging between adults and minors in anything we build.
- Players are minors: collect the minimum data (no player emails/phones in MVP).
- Messages go to team groups, not individual kids.

## GroupMe

Public API (https://dev.groupme.com), OAuth implicit flow per coach. Wrap all calls in `src/lib/groupme/` behind an interface so another channel (SMS, email) can be added. Phase 2: mirror the group's conversation in-app via GroupMe's push service.
