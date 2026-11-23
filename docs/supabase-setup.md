# Connecting Supabase

The app runs on browser-only data until these steps are done. Nothing here needs the
database password or the `service_role` key, so don't share those.

## 1. Create the project

At [supabase.com](https://supabase.com), create a project (free tier is fine). Pick the
region closest to the team. Keep the database password to yourself.

## 2. Copy two values into `.env.local`

Project Settings → API:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
```

`.env.local` is git-ignored. The anon key is meant for the browser; Row Level Security
in the database decides what each signed-in user can see and change.

## 3. Create the tables

SQL Editor → New query. Paste and run each file, in order:

1. `supabase/migrations/20261020000000_initial_schema.sql`
2. `supabase/migrations/20261021000000_save_lineup.sql`
3. `supabase/migrations/20261026000000_coach_pitch_field_players.sql`
4. `supabase/migrations/20261026120000_absent_players.sql`
5. `supabase/migrations/20261026180000_invites.sql`
6. `supabase/migrations/20261026200000_optioned_teams.sql`
7. `supabase/migrations/20261027000000_practices.sql`
8. `supabase/migrations/20261027120000_plays.sql`
9. `supabase/migrations/20261027180000_player_guardians.sql`
10. `supabase/migrations/20261028000000_team_money.sql`
11. `supabase/migrations/20261028120000_owner_role.sql` (run on its own, then the next one)
12. `supabase/migrations/20261028120100_team_owner.sql`
13. `supabase/migrations/20261029120000_restore_money_summary.sql`
14. `supabase/migrations/20261029180000_walkoff_receipts.sql`
15. `supabase/migrations/20261030000000_team_groupme.sql`
16. `supabase/migrations/20261030120000_groupme_treasurer.sql`
17. `supabase/migrations/20261031000000_team_look.sql`
18. `supabase/seed.sql` (optional: the sample Riverside Rattlers team)

When a new file appears in `supabase/migrations/` later, run just that file.

## 4. Allow sign-in redirects

Authentication → URL Configuration:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/auth/callback`
  (add the Vercel URL's `/auth/callback` too when the app is deployed)

## 5. Put the sign-in code in the email

Sign-in is code only: no link in the email (email scanners and other browsers used up links
before people tapped them). Authentication → Emails → **Magic Link** template, subject
`Your Fungo code: {{ .Token }}` (the code shows in the phone's notification), body:

```html
<h2>Here's your Fungo code</h2>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Type it on the sign-in screen and you're in. No password, no signs to steal.</p>
<p>Didn't ask for this? Ignore it. Nobody gets in without the code.</p>
<p>Fungo · Youth baseball's AI assistant coach</p>
```

Use the same subject and body in the **Confirm signup** template (first-time sign-ins use it).
Keep Resend's click tracking off.

## 6. Sign in and claim your team

Start the app (`npm run dev`), sign in with your email, and then either:

- **Create a new team** on the setup screen (you become its coach), or
- **Use the sample team** from `seed.sql`: in the SQL Editor run

  ```sql
  insert into public.member (team_id, user_id, role)
  select '00000000-0000-4000-8000-000000000001', id, 'coach'
  from auth.users where email = 'you@example.com';
  ```

  then reload the app.

## Notes

- Supabase's built-in email sends only a few messages per hour. Set up a real email
  provider (Authentication → SMTP Settings) before inviting the team.
- Without the two env vars the app falls back to local mode, which is handy for
  development and is what the unit tests use.

## Production setup (live)

- **App:** https://fungo.team (Vercel project `youth-baseball-app`; `www.fungo.team` redirects
  to it, and so do `rallycap.team` and `www.rallycap.team`, path and all, since Nov 2026).
  Pushing to `main` deploys.
- **Vercel env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Supabase URL Configuration:** Site URL `https://fungo.team`; Redirect URLs
  `https://fungo.team/**`, `https://www.fungo.team/**`, `https://www.rallycap.team/**`,
  `https://rallycap.team/**`, `https://youth-baseball-app-lime.vercel.app/**`,
  `http://localhost:3000/**`.
- **Notification job:** `select public.start_team_notifications('https://fungo.team/api/push/flush');`
  (the job posts to the site; it doesn't follow redirects).
- **Stripe webhook:** `https://fungo.team/api/stripe/webhook` (Stripe doesn't follow redirects).
- **Email:** Resend, domain `rallycap.team` verified (DNS records in Vercel). Supabase custom
  SMTP: host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key
  with sending access, sender `Fungo <signin@rallycap.team>`.
- **Email templates** (Magic Link and Confirm signup): code only (`{{ .Token }}`, also in the
  subject), no link; the text follows the sign-in screen's (see step 5).

If sign-in emails fail and nothing shows in Resend's logs, re-enter the SMTP password in
Supabase (it can be cleared when other SMTP fields are saved).

## Starting a fresh project (live, Nov 2026; also how to make the demo project)

In November 2026 the original project (full of test data) became **`rallycap-dev`**, for
branch previews and localhost, and live moved to a new, empty project. To build any new
project the same way:

1. **Make the project** (Pro plan, same region as the others). Keep the Data API on, with new
   tables exposed automatically. Keep the database password to yourself.
2. **Build the database:** `supabase/combine.sh <folder>` writes `part1.sql` and `part2.sql`.
   In the SQL Editor, run part 1, then part 2 (part 1 adds the "owner" role, which Postgres
   can't use in the same run). Both are tested from empty, each as one transaction.
3. **Sign-in:** URL Configuration (Site URL and redirect URLs, as in Production setup above),
   SMTP through Resend, and the Magic Link and Confirm signup templates (step 5).
4. **Vercel:** set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable
   key) and `SUPABASE_SERVICE_ROLE_KEY` (the secret key) for that environment only. Live uses
   **Production**; `rallycap-dev` is **Preview** and **Development**, and `.env.local`.
5. **Redeploy** that environment, then sign in and create a team.

Never copy live data into another project: it holds kids' names and parents' phone numbers.
