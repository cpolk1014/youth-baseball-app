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
- Claude API (`@anthropic-ai/sdk`, structured JSON output) for AI features, server-side only (`ANTHROPIC_API_KEY`); schedule import and typed fair-play rules use it
- ElevenLabs (REST via fetch, no SDK) for Gameday PA audio: music, announcer voice, sound effects; server-side only (`ELEVENLABS_API_KEY`, optional `ELEVENLABS_ANNOUNCER_VOICE_ID`)
- Stripe (`stripe` 23.0.0, server-only: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) for paying for seasons; the webhook records payments with the Supabase service role (`SUPABASE_SERVICE_ROLE_KEY`, server-only, `src/lib/supabase/admin.ts`)

## Features

The MVP gate is lifted: keep shipping features. Update this list as things ship.

**Shipped** (live at rallycap.team)

- Teams, seasons, roster (name, jersey #, preferred positions, can pitch/catch, active); coach's pitch teams
- Games (date, time, opponent, location, innings, 9 or 10 fielders); mark final (with an optional final score) / reopen; W-L record in the Games header; next-game banner
- Team look: coaches/managers pick two team colors (palette, exact color, or pulled from a picture) and upload a logo (squared, public `team-logos` bucket); colors drive the app (`--team` CSS vars, pale colors darkened so white text stays readable), logo/initials badge in the bar, menu, team switcher and printed lineup card; Plays fielders wear the team color
- Inning-by-inning lineup builder with live fair-play warnings, Auto-fill, batting order with sit-outs, per-game attendance
- Fair play rules screen (Season tab): every rule set to Must / Warn / Off with its number; separate coach pitch and kid pitch sets (pitching rules hidden for coach pitch); new rules: min outfield innings, min share of innings played, pitcher rest after a heavy game; reset to recommended. Coaches add their own rules from rule types (at least / at most N innings at positions, a player never plays a spot, a player locked to a spot in an inning, no one sits the same inning two games in a row, rotate the leadoff hitter); each is checked against the roster before saving, and auto-fill follows them
- Competitive lineups: per game, coaches pick Fair play or Competitive above Auto-fill (saved on the game). Competitive uses the season's GameChanger stats (`src/lib/rules/competitive.ts`, pure): batting order by sample-adjusted OBP (1st, 2nd), OPS (3rd), SLG (4th), then OPS; pitchers by WHIP; fielders by innings played at each spot and fielding %; the weakest by stats sit first. Small samples are pulled toward the team average, and kids under 10 PA / 5 IP rank after the rest. Must rules still apply; Warn rules are set aside (still shown as trade-offs). "Why this lineup?" explains it with each kid's numbers (coaches and managers); parents see how it was made, with no stats
- "Why this lineup?" under a game's lineup: rules it follows, trade-offs, and per kid the facts behind their spots (sits today vs. season rate, infield/outfield, pitching/catching, preferences, the coach's own rules); ties are called ties
- Typed rules: a coach types a rule in plain English; Claude (`/api/rules/interpret`, structured output, roster names only) answers rule / clarify (question + tap answers) / split / unsupported (closest rule); the app maps it to rule types, runs the same roster and auto-fill checks, and the coach confirms before it's added
- Season participation grid (summary and by position), fair to players who miss games
- Printable lineup card (half sheet ×2, full letter)
- Magic-link + code sign-in, invite links, roles (owner / coach / manager / treasurer / parent read-only), multiple teams with a switcher; the team creator is its Owner (coach powers, can never be removed or demoted)
- Parents linked to their kids (parent picks on first open; coaches/managers fix links on Coaches & parents); homework uses the links
- Option a team (archive, read-only, "Call Up" to restore); delete only optioned teams
- Offline dugout use: the last team data loaded is kept on the device (`rallycap:offline:v1`) and opens with no signal (amber "Offline · showing your team as of…" banner); lineups, attendance, batting order and final scores made offline wait in an outbox on the device (`src/lib/data/offline.ts`, survives restarts, newest change per game wins) and sync on reconnect, every 30 s, or on return to the app; other edits say they need a connection; a change the server refuses is dropped and shown. A service worker (`public/sw.js`, production only) keeps app code, serves pages from the device offline or after 4 s of weak signal, and pre-saves Games, the next three weeks of games and their lineup cards, and the main sections. Sign-out clears the device copy and saved pages
- Installable on a phone's home screen; responsive layout (phone and tablet: menu button top right (thumb reach) opens a slide-in menu; tablet: two-column lists, centered dialogs; desktop: the menu stays open on the side). The menu has the sections (Stats only for coaches and managers) plus Team links (Coaches & parents, My player's stats, Fair play rules, Team colors & logo, Uniforms, GroupMe)
- Practice schedule: build a season of practices (days × dates), each with a focus, a drill plan (starter library or custom, minutes vs. scheduled length), notes, cancel; parents view
- Import a schedule from a photo, PDF or CSV (Claude reads it; coach reviews before adding practices and games)
- Team money (phase 1): one ledger of Bat Arounds (split across players), Cleanups (one player), Walkoffs (team pays out), Safe at Home (family payments and money back), Rain Checks (credits), Grand Slams (fundraisers); installments with a first due date; family balances; team totals for everyone; parents see only their kids' charges plus all Walkoffs; coaches and treasurers edit. Walkoffs can carry a receipt (photo, shrunk before upload, or PDF) in a private storage bucket; everyone on the team can view it
- GroupMe: a coach or manager connects the team's group by creating a "RallyCap" bot on dev.groupme.com and pasting its Bot ID (test post on connect); post types: a game's batting order, a free-text message, and a new Bat Around (offered after saving; treasurers can post these too); editable preview before sending; posts go through the server route `/api/groupme/post`
- Game day posts (GroupMe page): one post per game day ("Game against The Cubs / Chabills Field / 7:00 PM / Arrive by 6:00 PM / White combo"; two games on a day go in one post with both times and opponents, per-game lines when places or uniforms differ); coaches pick when it posts (2–6 hours before the first game, the morning of, or 1–2 days before at a time) and the team's arrival (minutes before the first game; a game can set its own Arrive by). Built and sent by the database (`game_day_message`, `send_due_game_posts` every 10 minutes via pg_cron + pg_net, in the team's time zone), so the app's preview is exactly what posts; once per day per team; "Post now instead" skips the automatic one
- Batting order picture: from a game, coaches make a 1080×1350 image in team colors with the logo (drawn on the device) and share it through the phone's share sheet (GroupMe, Messages) or save it
- Gameday PA (menu section): walk-up songs per kid, made with AI (ElevenLabs Music: style, vibe, optional chant of the kid's name and number and up to 4 lines of words, sent as a composition plan so the words are sung; Claude (`/api/pa/lyrics`) writes 3 lyric options from a theme the family picks, kid-safe and original, editable before the song is made) or uploaded and trimmed on the phone (up to 20 s, fades, evened-out volume, saved as WAV); an AI announcer call (ElevenLabs voice) with "say it like" fields for the name and number (e.g. "six seven") and an editable script, over the intro or before the song; parents set up their own kids' walk-ups and a coach OKs them (enforced in the database); the PA board follows a game's batting order (Now batting, Next, a play button per kid), a soundboard of built-in organ tunes and effects made in the browser (pregame, organ, mound visit, quick hits) plus the team's own AI or uploaded sounds; Stop and volume always on screen; screen stays on; "Get ready" saves every clip on the phone so it plays with no signal. AI clips go through `/api/pa/generate` (server-only key, limits per rolling 24 hours per person (coaches and managers get more songs than families) and per team)
- Stats (menu section, coaches/owners and managers only, enforced in the database): import GameChanger's team stats export (CSV with Batting, Pitching, Fielding and a glossary) each week; each import replaces the season's stats; the import matches each GameChanger player to the roster (full name, first name + last initial, or jersey number when the name agrees too) and the coach fixes any match; tables per group with key columns or all, tap a column to sort (best first), the team totals row, players with nothing in a group hidden, a sheet per player with every stat and what it means
- Uniforms (Team menu, coaches/owners and managers): named combos of shirt, pants, hat, belt and socks (tap a color or type e.g. "White, red sleeves"); build combos from a picture or PDF of the uniform flyer (Claude, `/api/uniforms/read`, reviewed and fixed before saving); each game wears a saved combo or one made just for that game, shown on the game for the whole team
- My player's stats (Team menu, for anyone linked to a kid): a parent imports a GameChanger box score PDF (or screenshot) after each game; Claude (`/api/boxscore/read`) finds the parent's team side and their kid by the roster's jersey number (parents can't type one; name only when numbers aren't printed, flagged), the printed name must agree with the roster name (`namesAgree`) or it's refused, and returns only that kid's line, never anyone else's; it asks which team when it can't tell; the parent confirms "Is this your player?" before saving; the file isn't kept. Season totals (AVG/OBP/SLG/OPS, counts, pitching IP/ERA per 6/WHIP/strike %) and a game log; importing the same game again replaces it. Only the kid's linked parents can see or change these (not coaches)
- Clubs, phase 1 (`src/components/club/`, `src/lib/data/club-backend.ts`): a club (organization) has admins (director, admin) and one code per team per season (August–June, expires June 30). A team's coach enters the code on Coaches & parents (`redeem_club_code`); the team keeps its data and joins the club. While a team holds an active code, the club's admins can VIEW (never change) its players, games, lineups, season rules, imported team stats and coaches' names, enforced by RLS (`club_sees_team`); never money, parents or links, walk-ups, GroupMe or parents' box score imports. Club dashboard (`club_overview`): each team's age group, head coach, roster size, record, next game, last lineup (quiet 2+ weeks flagged), and the season's codes. Team view: lineups, playing time, rules, stats. Clubs, admins and codes are created in the SQL Editor (`create_club`, `add_club_admin`, `create_club_codes`). Phase 2: club tabs Teams / Look / Library / GroupMe. Look: club logo (team-logos bucket at club/<club id>/) and colors, which teams can apply on Team colors & logo ("Use them"), and club uniform combos (by hand or the flyer reader with clubId) that appear in every club team's uniform lists (marked Club, not editable by teams; games may wear them while the code is active). Library: club practice plans (in "Copy a plan") and homework play sets (in the assign form). GroupMe: the club's coaches group bot, and posts to it and to any or all club teams' groups, sent by the database (`club_groupme_post`, pg_net; team bots never leave it; 20 posts/hour). Fair-play rules stay with coaches (no club rule templates). Phase 3, paying (Stripe Checkout): seasons run August 1 – July 31 (`src/lib/billing/season.ts`; codes expire July 31). Clubs pay $99 per team and get that many codes (Buy codes on the club page; anyone signed in can Start a club, becoming its director); a team not in a club pays $129 for its season on Coaches & parents. From June, next season is on sale too. `/api/billing/checkout` starts Stripe Checkout; `/api/stripe/webhook` (signed) records the payment once via `fulfill_purchase` (service role only): codes for a club (new club + director for a first-time buyer), a `team_pass` for a team. Nothing is gated by payment yet (no paywall). Next: copying teams to next season
- Plays tab ("Where do I go?"): 57 animated situational plays with every position's job; random quizzes; coaches assign plays as homework to families and see who finished; plays can be added to a practice as situations to work on

**Next up** (roughly in order; the user picks)

- Team money phase 2: re-split a Bat Around when the roster changes, budget vs. actual, umpire-fee estimates from the schedule, pass fundraiser money on to families

- Tournament finder (shelved for now)

**Later:** AI practice plans, native chat, a paywall (what's free vs. paid).

## Data model

Source of truth: `supabase/migrations/`. Summary:

- organization: a club (optional parent of teams)
- club_admin: organization_id, user_id, role (director | admin)
- organization also has colors, logo_path; uniform_combo belongs to a team or (organization_id) a club
- club_practice_plan: organization_id, title, focus, items (JSONB drills); club_play_set: organization_id, title, play_ids[]
- club_groupme: organization_id, bot_id, group_name (club admins only); club_post_log (rate limit)
- purchase: stripe_session_id (unique), kind (club | team), organization_id or team_id, season_label, quantity, amount_cents, buyer; team_pass: team_id, season_label, expires_on (a team's own paid season)
- club_code: organization_id, code (8 characters), season_label ("2026-27"), expires_on, team_id (once used), redeemed_by, redeemed_at (one per team per season)
- team: name, age_group, colors (hex: [main, accent]), logo_path, groupme_group_id, coach_pitch, optioned_at (archived; delete only when set), timezone, arrive_minutes, game_post_mode (off | hours | days), game_post_hours, game_post_days, game_post_time
- season: team_id, name, start/end, fair_play_rules (JSONB, RuleConfig overrides)
- member: team_id, user_id, role (owner | coach | manager | treasurer | parent), display_name (no emails stored); one owner per team (the creator), protected by a trigger; `has_team_role` treats owner as coach
- player_guardian: player_id, user_id (parent ↔ kid links; families see their own, coaches/managers all; dropped when the member leaves)
- invite: team_id, role, token, expires_at, max_uses, uses, revoked_at (coach-only; joined via `accept_invite`)
- player: team_id, name, jersey_number, preferred_positions[], can_pitch, can_catch, active
- game: season_id, date, start_time, opponent, location, innings, field_players (9 | 10), status (scheduled | final), score_us, score_them, lineup_style (fair | competitive), uniform_combo_id or uniform_custom (JSONB pieces; one or the other), arrive_time (overrides the team's arrival)
- lineup: game_id, batting_order (player_id[]), not_batting[], absent[], version (saved via `save_lineup`)
- practice: season_id, practice_date, start_time, end_time, location, focus, notes, plan (JSONB drills), canceled, plays (library play ids)
- play_assignment: team_id, title, play_ids[], due_date (homework; plays live in code, `src/lib/plays/`)
- quiz_result: assignment_id, user_id, player_id?, correct, total (families see their own; coaches/managers see all)
- finance_entry: season_id, type (bat_around | cleanup | walkoff | safe_at_home | rain_check | grand_slam), title, amount_cents, entry_date, category, payee, method, refund, estimate, due_dates[], receipt_path (Walkoffs; file in the private `receipts` bucket at team/entry/file) (saved with shares via `save_finance_entry`; team totals via `finance_summary`)
- finance_share: entry_id, player_id, amount_cents (who an entry is tagged to; parents see only their kids')
- team_groupme: team_id, bot_id, group_name (coaches/managers manage it; treasurers can use it; parents never see the bot ID)
- walkup: player_id (one per kid), song_path, song_source (ai | upload), song_prompt, volume, announce, announce_mode (over | before), name_spoken, number_spoken, script, announce_path, status (pending | approved; only coaches approve, any other change goes back to pending) (files in the private `pa-audio` bucket at team/walkups/player/file)
- pa_sound: team_id, category (pregame | organ | mound | quick), label, path (pa-audio at team/sounds/file), source
- team_stats: season_id (one per season), file_name, data (JSONB: columns {group, key, description}, players {number, first, last, values, playerId}, totals), imported_by, imported_at (coaches and managers only; each import replaces it)
- uniform_combo: team_id, name, shirt, pants, hat, belt, socks (everyone on the team sees them; coaches and managers edit; a game can only wear its own team's combo)
- game_post_log: team_id, game_date, sent_at, automatic (one game day post per team per date)
- player_game_stat: player_id, season_id, game_date, opponent, our_runs, their_runs, team_name, box_name, batting (JSONB), pitching (JSONB or null), errors, positions (one kid's line from a box score; unique per kid, date and opponent; only the kid's linked parents can read or write)
- pa_generation: team_id, user_id, kind (song | announce | sound) (one row per AI clip; `pa_usage` counts the last day for limits)
- lineup_slot: lineup_id, inning, player_id, position (P, C, 1B, 2B, 3B, SS, LF, CF, RF, LCF, RCF, BENCH)

Participation is **derived** from lineup_slot rows on final games, never stored separately.

## Fair-play rules engine (core logic — keep it pure and tested)

Lives in `src/lib/rules/`. Pure TypeScript functions, no I/O, no React. Input: roster + lineup + rule config + season history. Output: list of violations `{ rule, playerId, inning?, severity: 'warn' | 'block', message }`.

Rules are configurable per season (Must = block, Warn, Off; core rules can't be turned off). Defaults:

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

Public API (https://dev.groupme.com). Today: one bot per team (the user chose bots over per-coach OAuth), posting via `https://api.groupme.com/v3/bots/post` from the server only; messages over 1,000 characters are split. All calls live in `src/lib/groupme/` behind the `TeamChannel` interface so another channel (SMS, email) can be added. Later, mirroring the group's conversation in-app would need OAuth per coach and GroupMe's push service.
