#!/bin/sh
set -eu

# Scheduler for the Postgres backup job (#250). Runs from the `postgres:18-alpine` image itself
# (see the `backup` service in docker-compose.prod.yml) rather than the `server` container: pg_dump
# has to match the *server* (not client) Postgres major version it's talking to, and this image is
# guaranteed to carry the right one for whatever `postgres:` tag the stack is actually running -
# installing a matching client into the Node-based server image would mean tracking that version
# by hand every time the Postgres image tag changes (see docker-compose.yml's comment on the 16->18
# jump for how painful getting that wrong already was, once, manually). This is a plain shell loop
# rather than real cron: no calendar syntax is needed for "every N hours, forever," and it avoids
# adding a cron daemon to the image just to get one. Same overall shape (interval loop, log-and-
# continue on failure) as jobs/scheduler.ts, which the in-process price-alert job (#255) uses for
# the same reason applied to a job that instead needs the running app's own Prisma/Redis clients.

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"
INTERVAL_SECONDS=$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))

mkdir -p "$BACKUP_DIR"

run_backup() {
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  dest="$BACKUP_DIR/${POSTGRES_DB:-squadqueue}-${ts}.sql.gz"
  raw_tmp="$BACKUP_DIR/.tmp-${ts}.sql"

  echo "[backup] $(date -u -Iseconds) starting dump -> $dest"
  # --no-owner/--no-acl: restoring under a different POSTGRES_USER (a fresh box, a renamed role,
  # ...) shouldn't fail on GRANT/OWNER TO statements referencing a role that doesn't exist there.
  # pg_dump's own exit status is checked directly (not via a `pg_dump | gzip` pipeline, whose
  # status under plain POSIX sh - no `pipefail` here - would just be gzip's) so a failed dump is
  # actually caught instead of silently producing a valid-looking, empty-ish gzip. Written to a
  # dotfile first and only gzipped/renamed to its final name on success, so a dump that dies
  # partway through (disk full, container killed mid-run) can never be mistaken for a complete,
  # restorable backup or picked up by rotate_backups's glob.
  if ! PGPASSWORD="${POSTGRES_PASSWORD:-changeme}" pg_dump \
      -h postgres -U "${POSTGRES_USER:-squadqueue}" --no-owner --no-acl "${POSTGRES_DB:-squadqueue}" \
      > "$raw_tmp"; then
    echo "[backup] $(date -u -Iseconds) pg_dump failed, leaving previous backups untouched" >&2
    rm -f "$raw_tmp"
    return 1
  fi

  gzip -f "$raw_tmp"
  mv "${raw_tmp}.gz" "$dest"
  echo "[backup] $(date -u -Iseconds) wrote $dest ($(du -h "$dest" | cut -f1))"
}

rotate_backups() {
  # Keep only the newest $RETENTION_COUNT dumps for this DB name - filenames sort chronologically
  # (UTC timestamp component) as plain strings, so `sort` needs no date parsing. Computed as
  # "total minus retention" rather than `head -n -N` (a GNU extension) since this runs under
  # BusyBox's ash/head on alpine, not bash/coreutils.
  # shellcheck disable=SC2012
  total=$(ls -1 "$BACKUP_DIR"/"${POSTGRES_DB:-squadqueue}"-*.sql.gz 2>/dev/null | wc -l)
  to_delete=$((total - RETENTION_COUNT))
  if [ "$to_delete" -gt 0 ]; then
    # shellcheck disable=SC2012
    ls -1 "$BACKUP_DIR"/"${POSTGRES_DB:-squadqueue}"-*.sql.gz | sort | head -n "$to_delete" | while IFS= read -r old; do
      [ -n "$old" ] || continue
      echo "[backup] $(date -u -Iseconds) rotating out $old"
      rm -f "$old"
    done
  fi
}

echo "[backup] starting - interval=${BACKUP_INTERVAL_HOURS:-24}h retention=${RETENTION_COUNT} dir=$BACKUP_DIR"

while true; do
  run_backup || true
  rotate_backups || true
  sleep "$INTERVAL_SECONDS"
done
