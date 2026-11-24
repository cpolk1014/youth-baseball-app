# Backups and restores

Fungo's live data is backed up twice:

1. **Supabase's own daily backup**, kept 7 days (Pro plan). Restore it from the Supabase
   dashboard: Database → Backups. Covers the database only, not Storage files.
2. **Our nightly off-site copy** in Cloudflare R2 (bucket `fungo-backups`), kept 30 days.
   Covers the database and every Storage bucket (team-logos, receipts, chatter-photos,
   pa-audio). Built by `.github/workflows/backup.yml` and `scripts/backup/backup.sh`.

The business continuity plan (a Claude doc, "Fungo Business Continuity Plan") says when to
use which, and logs every practice restore.

## The nightly job

- Runs at 3 AM Central (09:00 UTC) against **live**. Run it by hand from GitHub → Actions →
  Nightly backup → Run workflow, picking `live` or `dev`.
- A failed run emails the repo owner. Check the Actions tab after any database change that
  could break `pg_dump` (a new extension, a Postgres upgrade).
- What lands in R2:

| Path | What | Kept |
| --- | --- | --- |
| `db/<live or dev>/<date>/db.tar.gz.enc` | `full.dump` (pg_dump custom format, every schema), `roles.sql`, `schema.sql`, `data.sql`, encrypted | 30 days (lifecycle rule) |
| `db/<live or dev>/<date>/key.enc` | That night's key, locked with the backup public key | 30 days |
| `files/<live or dev>/<bucket>/…` | Current Storage files, encrypted by rclone crypt (names too) | While they exist in Fungo |
| `files-deleted/<live or dev>/<date>/…` | Files removed or replaced in Fungo that night | 30 days (lifecycle rule) |

## Secrets

Kept in the password manager, and in GitHub (Settings → Secrets and variables → Actions).
Never in the repo.

| Secret | Where in GitHub | What it is |
| --- | --- | --- |
| `R2_ENDPOINT` | Repository | `https://<account id>.r2.cloudflarestorage.com` (no bucket name) |
| `R2_KEY_ID`, `R2_SECRET` | Repository | Cloudflare Account API token, Object Read & Write on `fungo-backups` only |
| `BACKUP_PUBLIC_KEY` | Repository | Public half of the backup key pair (PEM). Not secret, but kept with the rest |
| `BACKUP_FILES_PASSWORD` | Repository | Password rclone uses to encrypt files |
| `SUPABASE_DB_URL` | Environments `live` and `dev`, each its own | Session pooler URI with the database password |
| `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION` | Environments `live` and `dev` | Storage → Settings → S3 Connection |
| `SUPABASE_S3_KEY_ID`, `SUPABASE_S3_SECRET` | Environments `live` and `dev` | Storage S3 access key `nightly-backup` |

**Only the password manager** holds the backup **private key** (`fungo-backup-private.pem`)
and the files password. Lose them and the off-site backups can't be opened by anyone,
including us. If the database password or a key changes, update GitHub the same day.

## Restoring

Never restore live data into `rallycap-dev` or any project other than live (it holds kids'
names and parents' phone numbers). Practice restores go into a **temporary** project that is
deleted the same day.

### Get a night's database backup

1. Cloudflare → R2 → `fungo-backups` → Objects → `db/live/<date>/`: download
   `db.tar.gz.enc` and `key.enc` into a new folder.
2. Save the private key from the password manager as a file, then:
   `scripts/backup/decrypt.sh <folder> <private key file>`
3. Delete the private key file and the unlocked folder when you're done.

### Bring back one table or a few rows

Install the Postgres client tools first if the Mac doesn't have them.

1. Restore `full.dump` into a temporary database (a new Supabase project, or local Postgres):
   `pg_restore --no-owner --no-privileges --schema=public --table=<table> -d <temp db url> full.dump`
2. Look at the rows there, then copy only what's needed into live with SQL.

### Rebuild the whole project

1. Make a new Supabase project the way `docs/supabase-setup.md` ("Starting a fresh project")
   describes, but skip building the database from `combine.sh`.
2. With the new project's session pooler URI:
   `psql "<url>" -f roles.sql`, then `psql "<url>" -f schema.sql` (errors about Supabase's
   own roles, schemas and extensions already existing are expected; errors in `public` are
   not), then
   `psql "<url>" -c "set session_replication_role = replica" -f data.sql`
   (the last skips triggers so notices and audit rows aren't fired again).
3. Bring back the files (below), then switch Vercel's Production Supabase variables to the
   new project and redeploy, as in step 4 of "Starting a fresh project".

### Bring back Storage files

Needs `rclone` and the files password. Set up the same remotes `backup.sh` uses (it builds
them from environment variables), then for each bucket:
`rclone copy r2crypt:files/live/<bucket> supa:<bucket>`
Files deleted in the last 30 days are under `r2crypt:files-deleted/live/<date>/<bucket>`.

## Practice restore (every 3 months, and before August 1)

1. Download and unlock last night's live backup (above).
2. Make a temporary Supabase project. Restore it with "Rebuild the whole project" steps 1–2.
3. Check row counts against live for a few tables (`team`, `player`, `game`, `chatter_post`),
   and that a sign-in account exists.
4. Copy one Storage file back from R2 and open it.
5. Delete the temporary project, the unlocked files and the private key file.
6. Log the date, time taken and anything that went wrong in the continuity plan.
