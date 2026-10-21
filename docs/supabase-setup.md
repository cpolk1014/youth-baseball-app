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
3. `supabase/seed.sql` (optional: the sample Riverside Rattlers team)

## 4. Allow sign-in redirects
Authentication → URL Configuration:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/auth/callback`
  (add the Vercel URL's `/auth/callback` too when the app is deployed)

## 5. Put the 6-digit code in the sign-in email
Authentication → Emails → **Magic Link** template. Add the code so people can type it
when the link opens in a different browser (common on iPhone):

```html
<h2>Sign in to Dugout Lineups</h2>
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
