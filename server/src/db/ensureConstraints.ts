import { prisma } from './client.js';

/** Prisma's schema DSL has no CHECK constraint support, and this project uses `db push` (no
 * migration history) rather than Migrate, so there's no natural place to hang raw SQL DDL -
 * this runs it directly at boot instead. Idempotent (checks pg_constraint first) so it's safe
 * to run on every startup. Only defense-in-depth: the API layer already validates 1-5 on every
 * write, this just protects against anything that writes to the table directly.
 *
 * Wrapped in try/catch and only logged, not thrown - a constraint that fails to apply (e.g.
 * because pre-existing data already violates it) shouldn't block the whole app from starting. */
export async function ensureDbConstraints(logger: { warn: (msg: string) => void }): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'votes_value_range') THEN
          ALTER TABLE votes ADD CONSTRAINT votes_value_range CHECK (value >= 1 AND value <= 5);
        END IF;
      END $$;
    `);
  } catch (err) {
    logger.warn(
      `Could not ensure votes.value CHECK constraint (non-fatal, API-layer validation still applies): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Backs requireNotDuplicate's "already in this room/shelf" check (gameAccess.ts) at the DB
  // layer - that check is a plain findFirst-then-create with no transaction, so two concurrent
  // requests for the same igdbId (a double-click, two tabs, or two "Re-sync Library" clicks
  // overlapping) can both pass it before either insert lands, producing duplicate rows. A single
  // `@@unique` can't express this in Prisma's schema DSL since the scope differs by case (room
  // games are unique per room_id, shelf games are unique per added_by, and room_id is nullable -
  // Postgres treats NULLs as distinct, so a plain composite unique wouldn't catch the shelf case
  // at all) - two partial unique indexes need raw SQL either way. Callers catch the resulting
  // P2002 the same way /api/rooms/join already does for its own unique constraint.
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS games_room_igdb_unique ON games (room_id, igdb_id) WHERE room_id IS NOT NULL;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS games_shelf_igdb_unique ON games (added_by, igdb_id) WHERE room_id IS NULL;
    `);
  } catch (err) {
    logger.warn(
      `Could not ensure games duplicate-igdb unique indexes (non-fatal, API-layer validation still applies): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
