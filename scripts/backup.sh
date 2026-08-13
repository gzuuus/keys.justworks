#!/usr/bin/env bash
# Online backup of the keys.justworks sqlite store.
#
# Uses sqlite3's `.backup` (the online-backup API): safe to run while the
# server is live, correct under WAL, and produces one consistent snapshot
# file. A raw `cp keys.db` would miss keys.db-wal / -shm and capture a torn
# state — never do that.
#
#   DATABASE_URL  read the same way the server does (sqlite:keys.db)  [sqlite:keys.db]
#   DB            explicit db path, overrides DATABASE_URL
#   BACKUP_DIR    output directory                                    [./backups]
#   BACKUP_KEEP   newest snapshots to retain                          [30]
#
# Restore (deliberately manual — it overwrites the live store):
#   1. stop the server
#   2. gunzip -c backups/keys-<ts>.db.gz > keys.db
#   3. restart the server
#
# Schedule with cron, e.g. hourly:
#   0 * * * * DATABASE_URL=sqlite:/data/keys.db BACKUP_DIR=/data/backups \
#             /opt/keys.justworks/scripts/backup.sh >> /var/log/kj-backup.log 2>&1
set -euo pipefail

url="${DATABASE_URL:-sqlite:keys.db}"
DB="${DB:-${url#sqlite:}}"
DB="${DB#//}"                       # tolerate sqlite://path
OUT_DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP:-30}"

command -v sqlite3 >/dev/null || { echo "sqlite3 not installed" >&2; exit 1; }
[ -f "$DB" ] || { echo "db not found: $DB" >&2; exit 1; }

mkdir -p "$OUT_DIR"
ts=$(date -u +%Y%m%dT%H%M%SZ)
snap="$OUT_DIR/.keys.$ts.tmp"        # `.backup` writes a plain (uncompressed) file
out="$OUT_DIR/keys-$ts.db.gz"

sqlite3 "$DB" ".backup '$snap'"      # consistent snapshot, safe under WAL / live server
gzip -9 "$snap"
mv "$snap.gz" "$out"                 # atomic rename (same dir)

# retain only the newest $KEEP snapshots
ls -1t "$OUT_DIR"/keys-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) |
  while IFS= read -r f; do rm -f "$f"; done

echo "backed up $DB -> $out"
