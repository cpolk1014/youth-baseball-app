#!/usr/bin/env bash
# Unlock one night's database backup (see docs/backups.md).
#   scripts/backup/decrypt.sh <folder with db.tar.gz.enc and key.enc> <private key .pem>
# Writes <folder>/db/: full.dump, roles.sql, schema.sql, data.sql.
# Works with the openssl that comes with macOS.
set -euo pipefail
DIR=${1:?folder with db.tar.gz.enc and key.enc}
PRIVATE=${2:?private key .pem}
umask 077
KEY=$(mktemp)
trap 'rm -f "$KEY"' EXIT

openssl pkeyutl -decrypt -inkey "$PRIVATE" -pkeyopt rsa_padding_mode:oaep \
  -in "$DIR/key.enc" -out "$KEY"
openssl enc -d -aes-256-cbc -md sha256 -pbkdf2 -iter 200000 \
  -in "$DIR/db.tar.gz.enc" -pass "file:$KEY" | tar -C "$DIR" -xzf -
ls -lh "$DIR/db"
