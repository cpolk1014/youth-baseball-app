#!/bin/zsh
# Builds the whole database for a NEW Supabase project as two SQL files to paste into the SQL
# Editor, in order: part 1 ends with the migration that adds the "owner" role (Postgres can't
# use a new enum value in the same run), part 2 is everything after it.
# Usage: supabase/combine.sh <output folder>
set -e
ROOT="${0:A:h:h}"
OUT="${1:?Give an output folder}"
mkdir -p "$OUT"
SPLIT="20261028120000_owner_role.sql"
: > "$OUT/part1.sql"; : > "$OUT/part2.sql"
target="$OUT/part1.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  { echo "-- ── ${f:t} ──"; cat "$f"; echo; } >> "$target"
  [[ "${f:t}" == "$SPLIT" ]] && target="$OUT/part2.sql"
done
wc -l "$OUT/part1.sql" "$OUT/part2.sql"
