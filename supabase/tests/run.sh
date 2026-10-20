#!/bin/zsh
# Runs migrations, seed and RLS tests against a throwaway local Postgres 15.
# Needs Postgres 15 binaries (PG_BIN, default: the EDB installer path). No Docker needed.
set -e
BIN="${PG_BIN:-/Library/PostgreSQL/15/bin}"
ROOT="${0:A:h:h:h}"
TMP="$(mktemp -d)"
DATA="$TMP/data"
PORT="${PG_TEST_PORT:-54399}"
"$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" -l "$TMP/pg.log" -w start >/dev/null
trap '"$BIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null; rm -rf "$TMP"' EXIT
PSQL=("$BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase-shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "migrate: ${f:t}"; "${PSQL[@]}" -f "$f"; done
echo "seed: seed.sql"
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
"${PSQL[@]}" -t -f "$ROOT/supabase/tests/rls.sql" 2>&1 | sed -n 's/^psql:.*NOTICE:  //p; /PASSED/p'
