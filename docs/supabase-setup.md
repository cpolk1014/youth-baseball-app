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
13. `supabase/seed.sql` (optional: the sample Riverside Rattlers team)

When a new file appears in `supabase/migrations/` later, run just that file.

## 4. Allow sign-in redirects

Authentication → URL Configuration:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/auth/callback`
  (add the Vercel URL's `/auth/callback` too when the app is deployed)

## 5. Put the sign-in code in the email

Authentication → Emails → **Magic Link** template. Add the code so people can type it
when the link opens in a different browser (common on iPhone):

```html
<h2>Sign in to RallyCap</h2>
<p><a href="{{ .ConfirmationURL }}">Tap here to sign in</a></p>
<p>Or enter this code: <strong>{{ .Token }}</strong></p>
```

Do the same in the **Confirm signup** template (first-time sign-ins use it).

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

- **App:** https://www.rallycap.team (Vercel project `youth-baseball-app`; `rallycap.team`
  redirects to `www`). Pushing to `main` deploys.
- **Vercel env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Supabase URL Configuration:** Site URL `https://www.rallycap.team`; Redirect URLs
  `https://www.rallycap.team/**`, `https://rallycap.team/**`,
  `https://youth-baseball-app-lime.vercel.app/**`, `http://localhost:3000/**`.
- **Email:** Resend, domain `rallycap.team` verified (DNS records in Vercel). Supabase custom
  SMTP: host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key
  with sending access, sender `RallyCap <signin@rallycap.team>`.
- **Email templates** (Magic Link and Confirm signup) include both the link and the code
  (`{{ .Token }}`), so sign-in works inside the home-screen app too.

If sign-in emails fail and nothing shows in Resend's logs, re-enter the SMTP password in
Supabase (it can be cleared when other SMTP fields are saved).
