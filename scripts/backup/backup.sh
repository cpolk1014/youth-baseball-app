#!/usr/bin/env bash
# Nightly off-site backup: the Supabase database and every Storage bucket, copied to
# Cloudflare R2. Runs in GitHub Actions (.github/workflows/backup.yml); restore steps
# are in docs/backups.md.
#
# Layout in the fungo-backups bucket (TARGET is live or dev):
#   db/<TARGET>/<YYYY-MM-DD>/db.tar.gz.enc   the dumps, encrypted (AES-256, PBKDF2)
#   db/<TARGET>/<YYYY-MM-DD>/key.enc         that night's key, locked with BACKUP_PUBLIC_KEY (RSA-OAEP)
#   files/<TARGET>/<bucket>/...              Storage files, encrypted by rclone crypt
#   files-deleted/<TARGET>/<YYYY-MM-DD>/...  files removed or replaced in Fungo that night
# R2 lifecycle rules delete db/ and files-deleted/ after 30 days.
#
# Needs: docker, rclone, openssl, and these environment variables:
#   TARGET, SUPABASE_DB_URL (session pooler URI),
#   SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION, SUPABASE_S3_KEY_ID, SUPABASE_S3_SECRET,
#   R2_ENDPOINT, R2_KEY_ID, R2_SECRET, BACKUP_PUBLIC_KEY (PEM), BACKUP_FILES_PASSWORD
set -euo pipefail

: "${TARGET:?}" "${SUPABASE_DB_URL:?}" "${SUPABASE_S3_ENDPOINT:?}" "${SUPABASE_S3_REGION:?}"
: "${SUPABASE_S3_KEY_ID:?}" "${SUPABASE_S3_SECRET:?}" "${R2_ENDPOINT:?}" "${R2_KEY_ID:?}"
: "${R2_SECRET:?}" "${BACKUP_PUBLIC_KEY:?}" "${BACKUP_FILES_PASSWORD:?}"
case "$TARGET" in live | dev) ;; *) echo "TARGET must be live or dev" >&2; exit 1 ;; esac

BUCKET=fungo-backups
DAY=$(date -u +%F)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
umask 077

# --- rclone remotes, from the environment (no config file on disk) ---
export RCLONE_CONFIG_SUPA_TYPE=s3
export RCLONE_CONFIG_SUPA_PROVIDER=Other
export RCLONE_CONFIG_SUPA_ENDPOINT="$SUPABASE_S3_ENDPOINT"
export RCLONE_CONFIG_SUPA_REGION="$SUPABASE_S3_REGION"
export RCLONE_CONFIG_SUPA_ACCESS_KEY_ID="$SUPABASE_S3_KEY_ID"
export RCLONE_CONFIG_SUPA_SECRET_ACCESS_KEY="$SUPABASE_S3_SECRET"
export RCLONE_CONFIG_SUPA_FORCE_PATH_STYLE=true

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true # the token can only reach this one bucket

# Files are encrypted on the way into R2 (names too); BACKUP_FILES_PASSWORD opens them.
export RCLONE_CONFIG_R2CRYPT_TYPE=crypt
export RCLONE_CONFIG_R2CRYPT_REMOTE="r2:$BUCKET"
RCLONE_CONFIG_R2CRYPT_PASSWORD=$(rclone obscure "$BACKUP_FILES_PASSWORD")
export RCLONE_CONFIG_R2CRYPT_PASSWORD

# --- 1. Database ---
# pg_dump must be at least the server's version, so use the server's own major version.
PG_MAJOR=$(docker run --rm postgres:17 psql "$SUPABASE_DB_URL" -tAc "show server_version_num" | cut -c1-2)
PG_IMAGE="postgres:$PG_MAJOR"
echo "Postgres $PG_MAJOR"
mkdir -p "$WORK/db"
dump() { docker run --rm --user "$(id -u)" -v "$WORK/db:/out" "$PG_IMAGE" pg_dump "$SUPABASE_DB_URL" "$@"; }

# Full copy (every schema, including auth and storage records): restore one table or all.
dump --format=custom --file=/out/full.dump
# Supabase's own whole-project restore set: roles, structure, data.
docker run --rm --user "$(id -u)" -v "$WORK/db:/out" "$PG_IMAGE" pg_dumpall --dbname="$SUPABASE_DB_URL" \
  --roles-only --no-role-passwords --file=/out/roles.sql
dump --schema-only --file=/out/schema.sql
dump --data-only --file=/out/data.sql

for f in full.dump roles.sql schema.sql data.sql; do
  [ -s "$WORK/db/$f" ] || { echo "$f is empty" >&2; exit 1; }
done
ls -lh "$WORK/db"

# Encrypt: a fresh random key each night, locked with the public key. Only the private
# key (in the password manager, never in GitHub) can open it.
printf '%s\n' "$BACKUP_PUBLIC_KEY" > "$WORK/public.pem"
openssl rand -hex 32 > "$WORK/key"
tar -C "$WORK" -czf "$WORK/db.tar.gz" db
openssl enc -aes-256-cbc -md sha256 -pbkdf2 -iter 200000 -salt \
  -in "$WORK/db.tar.gz" -out "$WORK/db.tar.gz.enc" -pass "file:$WORK/key"
openssl pkeyutl -encrypt -pubin -inkey "$WORK/public.pem" -pkeyopt rsa_padding_mode:oaep \
  -in "$WORK/key" -out "$WORK/key.enc"
rm -rf "$WORK/key" "$WORK/db" "$WORK/db.tar.gz"

rclone copyto "$WORK/db.tar.gz.enc" "r2:$BUCKET/db/$TARGET/$DAY/db.tar.gz.enc"
rclone copyto "$WORK/key.enc" "r2:$BUCKET/db/$TARGET/$DAY/key.enc"
echo "Database saved to db/$TARGET/$DAY/"

# --- 2. Storage files ---
# Only new or changed files move. Files gone from Fungo move to files-deleted/ (and
# leave after 30 days), so the copy never keeps deleted photos forever.
BUCKETS=$(rclone lsf --dirs-only supa: | sed 's:/$::')
[ -n "$BUCKETS" ] || { echo "No Storage buckets found" >&2; exit 1; }
for b in $BUCKETS; do
  echo "Files: $b"
  rclone sync "supa:$b" "r2crypt:files/$TARGET/$b" \
    --backup-dir "r2crypt:files-deleted/$TARGET/$DAY/$b" \
    --transfers 8 --stats-one-line --stats 30s
done

echo "Backup of $TARGET finished: $DAY"
