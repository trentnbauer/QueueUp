#!/bin/sh
set -e

# Run as the unprivileged `node` user (issue #920). The container starts as root only so it can fix
# the ownership of the backups volume - a named volume created by an earlier (root-running) image
# is root-owned, and the nightly backup / restore would otherwise start failing after the upgrade.
# The app code stays root-owned and read-only to `node`. Setting `user:` in compose skips this
# block (nothing to drop from); the backup directory must then already be writable by that user.
if [ "$(id -u)" = "0" ]; then
  # With BACKUP_DIR unset the app falls back to ./backups under the working directory.
  backup_dir="${BACKUP_DIR:-/repo/server/backups}"
  mkdir -p "$backup_dir" 2>/dev/null || true
  chown -R node:node "$backup_dir" 2>/dev/null || echo "[entrypoint] Could not chown $backup_dir (bind mount?). Make it writable by uid $(id -u node) or backups will fail."
  export HOME=/home/node
  exec su-exec node "$0" "$@"
fi

# Syncs Postgres to match schema.prisma. Using `db push` rather than migrations for M1 —
# no migration history yet, and this applies the schema directly without hand-written SQL.
#
# --accept-data-loss is NOT passed by default (issue #521): db push has no migration diff to
# work from, so it can misjudge an ordinary change as destructive (a column rename reads as
# drop-then-add, a type narrowing reads as a truncating ALTER) and --accept-data-loss silently
# lets any such change through on every boot/redeploy, with no prompt or gate. Without the flag,
# Prisma still applies every *non*-destructive change normally; it only refuses (non-interactively,
# since this container has no TTY to prompt on - it errors and exits non-zero rather than hanging)
# when it detects actual data loss, which then requires deliberately re-running with
# ALLOW_DESTRUCTIVE_SCHEMA_PUSH=true - a conscious, one-time opt-in for the deploy that needs it,
# not a standing default.
#
# When the opt-in is set, the safe push is still tried first. Only if Prisma refuses it (i.e. there
# really is data loss) do we take a database backup - written to BACKUP_DIR as
# queueup-<time>-pre-schema-push.json.gz and listed in the admin Backups screen - and then push
# with --accept-data-loss. If the backup can't be written, the script exits non-zero and (set -e)
# the container stops without touching the schema.
if [ "$ALLOW_DESTRUCTIVE_SCHEMA_PUSH" = "true" ]; then
  if ! npx prisma db push --schema src/db/prisma/schema.prisma --skip-generate; then
    echo "[schema-push] Schema change needs --accept-data-loss; backing up the database first."
    node dist/scripts/preSchemaPushBackup.js
    npx prisma db push --schema src/db/prisma/schema.prisma --skip-generate --accept-data-loss
  fi
else
  npx prisma db push --schema src/db/prisma/schema.prisma --skip-generate
fi

exec node dist/bootstrap.js
