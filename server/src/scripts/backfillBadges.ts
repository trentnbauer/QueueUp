import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same dotenv-loading as bootstrap.ts (this script bypasses bootstrap.ts entirely, so it needs
// its own copy) - loads the repo-root .env for local/manual runs; in Docker, real env vars are
// already set by compose, and dotenv silently no-ops when it finds no file to load.
config({ path: path.resolve(__dirname, '../../../.env') });

const { prisma } = await import('../db/client.js');
const { unlockBadge } = await import('../services/badges.js');

/** One-time backfill for badges that predate the badge system itself (issue #489, shipped
 * 2026-08-03) - badges are one-shot "first time you did X" unlocks with no automatic backfill by
 * design (see BadgeKey's doc comment in packages/shared/src/types.ts), so anyone who did X before
 * that date never got credit for it.
 *
 * Only backfills the badges where "who did this" is unambiguous from data already on file:
 *
 *   - first_solo_beat / first_replay / first_wishlist: Personal Shelf games only (roomId null).
 *     A shelf item's status can only ever be changed by its own owner - see
 *     requireGameReadAccess/requireGameDeleteAccess in gameAccess.ts ("a shelf item only its
 *     owner") - so `addedBy` reliably says who set that status. Deliberately excludes room games
 *     with the same status: "any room member can change status" there, so a room game's current
 *     status doesn't reliably say who set it, and guessing wrong would credit the wrong person
 *     for someone else's action. (first_room_beat is left out entirely for the same reason - it
 *     only ever applies to room games.)
 *   - first_room_created: Room.createdBy is authoritative, no ambiguity regardless of scope.
 *
 * Deliberately does NOT attempt first_library_sync ("Synced Up") - there's no persisted signal
 * that distinguishes a game the Steam import loop created from one added manually and later
 * Steam-matched for pricing (both end up with the same platform label and steamAppid shape), so
 * there's nothing reliable to check retroactively. It doesn't need backfilling to become
 * reachable again either, unlike the others - see this same issue's fix in routes/games.ts - the
 * very next Steam library/wishlist sync unlocks it regardless of whether it finds anything new to
 * import.
 *
 * Idempotent (unlockBadge's own create-and-catch-unique-violation), so safe to re-run - it will
 * just no-op for every user who already has the badge, from this script or the normal hook path.
 *
 * Usage (from server/): npm run backfill:badges [-- --dry-run]
 */

const DRY_RUN = process.argv.includes('--dry-run');

const SHELF_STATUS_BADGE_KEYS = {
  done: 'first_solo_beat',
  replay: 'first_replay',
  wishlist: 'first_wishlist',
} as const;

async function backfillShelfStatusBadges(): Promise<number> {
  const rows = await prisma.game.findMany({
    where: { roomId: null, status: { in: Object.keys(SHELF_STATUS_BADGE_KEYS) as (keyof typeof SHELF_STATUS_BADGE_KEYS)[] } },
    select: { addedBy: true, status: true },
    distinct: ['addedBy', 'status'],
  });

  let unlocked = 0;
  for (const row of rows) {
    const key = SHELF_STATUS_BADGE_KEYS[row.status as keyof typeof SHELF_STATUS_BADGE_KEYS];
    if (DRY_RUN) {
      console.log(`[dry-run] would unlock ${key} for user ${row.addedBy}`);
      continue;
    }
    if (await unlockBadge(row.addedBy, key)) unlocked++;
  }
  return unlocked;
}

async function backfillRoomCreatedBadge(): Promise<number> {
  const rows = await prisma.room.findMany({ select: { createdBy: true }, distinct: ['createdBy'] });

  let unlocked = 0;
  for (const row of rows) {
    if (DRY_RUN) {
      console.log(`[dry-run] would unlock first_room_created for user ${row.createdBy}`);
      continue;
    }
    if (await unlockBadge(row.createdBy, 'first_room_created')) unlocked++;
  }
  return unlocked;
}

async function main() {
  console.log(DRY_RUN ? 'Badge backfill (dry run - no writes)...' : 'Badge backfill...');
  const shelfCount = await backfillShelfStatusBadges();
  const roomCount = await backfillRoomCreatedBadge();
  if (!DRY_RUN) {
    console.log(`Done. Newly unlocked: ${shelfCount} shelf-status badge(s), ${roomCount} first_room_created badge(s).`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
