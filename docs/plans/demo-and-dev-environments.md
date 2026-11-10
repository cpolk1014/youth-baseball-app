# Demo and development versions of RallyCap: the plan

Status: plan only, nothing built. Written November 9, 2026.

## The short version

Run three copies of RallyCap from the one codebase. Each gets its own database, so nothing
done in one can touch another.

|                    | Live                  | Demo                            | Development                                   |
| ------------------ | --------------------- | ------------------------------- | --------------------------------------------- |
| **For**            | Real teams            | Showing RallyCap to people      | Building and testing                          |
| **Address**        | www.rallycap.team     | demo.rallycap.team              | dev.rallycap.team, branch previews, localhost |
| **Git branch**     | `main`                | `demo`                          | `develop` and feature branches                |
| **Database**       | Today's Supabase      | New Supabase project            | New Supabase project                          |
| **Data**           | Real families         | Made-up team, reset nightly     | Made-up teams, free to break                  |
| **Stripe**         | Live keys (at launch) | Test keys                       | Test keys                                     |
| **GroupMe**        | Real                  | Never posts                     | One private test group only                   |
| **AI**             | Real                  | Real, with a daily spending cap | Real, with a low spending cap                 |
| **Search engines** | Allowed               | Blocked                         | Blocked                                       |

**One rule never bends: live data is never copied into demo or development.** It holds
kids' names, parents' phone numbers and box scores. Demo and development only ever hold
made-up people.

## Why development should come first

The request was "at some point," but development is more urgent than the demo:

- **A push to `main` goes straight to paying families.** Nothing sits in between.
- **`.env.local` points at a real Supabase project,** which the setup notes indicate is the
  live one. Signing in on localhost reads and writes real data.
- **Branch previews may use live data too.** If the Supabase variables in Vercel are set for
  all environments, every preview does. This needs checking in Vercel.
- **Migrations hit the live database first.** There's no place to rehearse one. An earlier
  lesson already came from this: test data migrations against realistic rows.
- **Test records are mixed in with real ones.** Test purchases and codes are in the live
  database and need cleaning up before launch.

Recommendation: finish Phase 1 before the Traction Canes pilot and the January launch.

## What it costs

| Item                               | Cost                             | Notes                                                                                                             |
| ---------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Supabase Pro                       | $25/month per organization       | Includes $10 of compute, which covers one small project, plus daily backups. Projects don't pause.                |
| Two more small projects            | About $10/month each             | Micro compute is about $0.0134/hour.                                                                              |
| Vercel Pro                         | Check the current per-seat price | Includes one custom environment per project, which the demo uses. Hobby is for personal, non-commercial use only. |
| Anthropic, ElevenLabs, Google Maps | A capped amount of usage         | Separate keys for demo and development, each with its own limit.                                                  |

So Supabase comes to about **$45/month** for all three copies.

The free Supabase plan would save about $20 a month, but free projects pause after a week of
low activity. A demo that's asleep when you open it in front of a club director is the worst
way for this to fail, so I'd pay. I can't see which plans RallyCap is on today. A product
taking payments should be on Vercel Pro and have Supabase backups regardless of this plan.

Not recommended for now: Supabase Branching (a database per git branch). It bills per branch
and solves a problem a one-person team doesn't have yet.

## Phase 1: Development (about a day)

**Craig does** (keys and account settings stay with Craig):

1. Confirm or move to Vercel Pro and Supabase Pro.
2. Create the Supabase project `rallycap-dev`, in the same region as live.
3. Copy the live project's settings by hand, following `docs/supabase-setup.md`: redirect URLs,
   the Magic Link and Confirm signup email templates (with the code), and SMTP through Resend.
4. In Vercel, scope the current Supabase and Stripe variables to **Production only**, and add
   `rallycap-dev` values for **Preview**. Add separate AI and Maps keys with spending caps.
5. Add dev.rallycap.team and assign it to the `develop` branch.
6. Point `.env.local` at `rallycap-dev`.
7. Dump the live schema so it can be compared (step 2 below).

**I build:**

1. `NEXT_PUBLIC_APP_ENV` (`production`, `demo` or `development`) and one small helper to read
   it, with a clear banner on anything that isn't live.
2. A check that the 48 migration files, replayed from empty, match the live schema. They were
   all run by hand, so differences are possible, and the local test database only replays them
   against a stand-in for Supabase.
3. A fuller development seed. `supabase/seed.sql` is one team and two games today.
4. Search engines blocked outside live. `src/app/robots.ts` and `src/app/sitemap.ts` hard-code
   the live site and allow everything. Add a `noindex` header in `src/proxy.ts`.
5. `src/app/(site)/layout.tsx` takes its address from the environment.
6. No service worker on development, so testers never get stale pages. Demo keeps it, because
   offline use is worth showing.
7. Update `docs/supabase-setup.md` and CLAUDE.md with the new workflow.

**Careful with GroupMe:** the database sends GroupMe posts by itself. The migrations set up the
10-minute job on any Supabase project that supports it, so development and demo get it too.
It's harmless as long as no real bot ID is ever entered there, which is one more reason never
to copy live data.

**Done when:** a change can go from localhost to dev.rallycap.team and be tried end to end,
including a Stripe test payment, with no new rows in the live database.

### How day-to-day work changes

| You say           | What happens                                                                      |
| ----------------- | --------------------------------------------------------------------------------- |
| "Push it"         | Goes to `develop` and dev.rallycap.team. Any migration runs on development first. |
| "Ship it"         | Migration runs on live, I verify it, then `develop` merges to `main`.             |
| "Update the demo" | Migration runs on demo, then the `demo` branch moves up to `main`.                |

The demo only changes when you ask, so it won't shift under you the morning of a presentation.
The existing rule stays: never ship code that needs a migration that hasn't been run.

## Phase 2: The demo's plumbing (about a day)

**Craig does:** create the `rallycap-demo` project with the same settings, add a Vercel custom
environment `demo` that tracks the `demo` branch at demo.rallycap.team, and add a Stripe test
webhook for it.

**I build:**

1. **One-tap demo sign-in.** RallyCap only has magic link and code today, which is no good in a
   meeting. The demo's sign-in page offers **Coach**, **Parent** and **Club director**, each a
   fixed made-up account. It's a server route that uses the service role key, so it refuses to
   run unless the environment is `demo` **and** the Supabase project is the demo project.
   Both checks are tested.
2. **A passcode on the demo** to start, so the AI budget isn't open to the internet.
3. **Outbound switched off.** GroupMe posts show the preview, then "In the demo this doesn't
   really post." Connecting a real bot is disabled.
4. **A daily AI cap** across all the AI routes. A friendly "the demo's AI has had enough for
   today" beats a surprise bill.
5. **Nightly reset,** plus a "Reset the demo" button for the presenter. The reset function lives
   in `supabase/demo/`, outside `supabase/migrations/`, so it can never reach the live database.

**Done when:** you can open the demo on a phone, tap Coach, and be in the team within seconds,
and the same build refuses demo sign-in everywhere else.

## Phase 3: The demo's content (one to two days)

This is what makes it convincing. The team is the Bayou Bombers 10U, the made-up team from the
website. The temporary file behind its website screenshots is gone, so its data gets rebuilt as a seed in the repo.

Every date is relative to today, so there's always a game this weekend and a recent win.

- **Team:** 12 made-up kids, parents, colors, logo and uniforms.
- **Season:** about 10 final games with lineups, so playing time and charts have something to
  show, and upcoming games with one lineup still to set so To do isn't empty.
- **Money:** Bat Arounds, payments and a receipt, with one family overdue.
- **Practice:** a planned schedule and homework that's partly done.
- **Stats:** GameChanger numbers, so competitive lineups and "Why this lineup?" work.
- **Tournament:** caught mid-weekend, so standings and "What time do we play tomorrow?" have
  something to answer.
- **Parent view:** box scores, trends and an unlocked stats pass.
- **Walk-ups and PA:** several approved songs and announcer calls, made once and kept.
- **Pine Tar:** a staged clip that doesn't show a real child.
- **Club:** the Bombers plus about five more teams, with awards live and some still to pick.
- **Paywall:** demo teams stay unlocked well into the future, so nobody hits a lock mid-pitch.

Also: a one-page script for a 5-minute walkthrough, by role.

**Done when:** every menu item for all three roles shows something worth looking at, with
nothing empty, and a reset brings it all back.

## Phase 4: Later, only if needed

- **Migrations by command** with the Supabase CLI, instead of pasting into three SQL Editors.
  Worth it once pasting becomes the annoying part. It needs the migration history registered
  on live first, and Craig would run it, since it needs the database password.
- **Self-serve demo from the website.** Shared data works when you're presenting. A public
  "Try it" button needs a private sandbox per visitor, which is a bigger build.
- **Automated checks** (typecheck, lint, tests, database tests) on every push to `develop`.

## Decisions for Craig

| #   | Decision                              | Recommendation                                                       |
| --- | ------------------------------------- | -------------------------------------------------------------------- |
| 1   | Who uses the demo at first?           | You, in meetings and by private link, behind a passcode              |
| 2   | Paid plans or free projects?          | Paid. About $20/month more, and the demo never falls asleep          |
| 3   | Real AI in the demo?                  | Yes, with a daily cap. It's the pitch                                |
| 4   | OK for "Push it" to mean development? | Yes, with "Ship it" meaning live                                     |
| 5   | When?                                 | Phase 1 before the January launch. Phases 2 and 3 when a demo is due |

## Do alongside this

Supabase retires its legacy API keys in early 2027. New projects can start on publishable keys,
and the live project's switch fits naturally into Phase 1.

## Sources (pricing as of November 2026, check before buying)

- [Supabase: database-only project cost](https://supabase.com/kb/faqs/platform/database-only-cost)
- [Supabase: Branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching)
- [Vercel: pricing](https://vercel.com/pricing)
- [Vercel: environments](https://vercel.com/docs/deployments/environments)
- [Vercel: setting up a staging environment](https://vercel.com/kb/guide/set-up-a-staging-environment-on-vercel)
