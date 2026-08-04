import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BadgeKey } from '@queueup/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same dotenv-loading as bootstrap.ts (this script bypasses bootstrap.ts entirely, so it needs
// its own copy) - loads the repo-root .env for local/manual runs; in Docker, real env vars are
// already set by compose, and dotenv silently no-ops when it finds no file to load.
config({ path: path.resolve(__dirname, '../../../.env') });

const { prisma } = await import('../db/client.js');
const { unlockBadge, maybeUnlockFullCollection } = await import('../services/badges.js');

/** One-time backfill for badges that predate the badge system itself (issue #489, shipped
 * 2026-08-03) or predate a later batch of new badges added to it - badges are one-shot "first time
 * you did X" unlocks with no automatic backfill by design (see BadgeKey's doc comment in
 * packages/shared/src/types.ts), so anyone who did X before the relevant badge existed never got
 * credit for it.
 *
 * Only backfills badges where "who did this" is unambiguous from data already on file:
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
 *   - first_tag_applied: Tag.userId is the tag's creator/owner, authoritative regardless of which
 *     game(s) it's since been applied to.
 *   - first_franchise_finished / first_dlc_completionist: same Personal-Shelf-only reasoning as
 *     first_solo_beat above - completionBadgeKeys (routes/games.ts) itself only ever attributes
 *     these to the shelf owner or an ambiguous room, so backfill sticks to the unambiguous half.
 *   - first_bargain_hunter: Game.notifiedAtlPrice is a reliable, persisted "an ATL alert fired for
 *     this game" signal (see priceAlerts.ts / gameOwnership.ts) - joined against GameOwnership,
 *     same check setOwnershipPlatforms runs live.
 *   - first_marathoner / first_comeback: derived from PlayLog rows, which already existed before
 *     these badges did (issue #361) - Personal Shelf only, same reasoning as above (a room
 *     PlayLog entry doesn't reliably say which member's status change closed it).
 *
 * Deliberately does NOT attempt:
 *   - first_library_sync ("Synced Up"): no persisted signal distinguishes a game the Steam import
 *     loop created from one added manually and later Steam-matched for pricing. Doesn't need
 *     backfilling to become reachable again either - see this issue's fix in routes/games.ts - the
 *     very next Steam library/wishlist sync unlocks it regardless of whether it finds anything new.
 *   - first_pc_sync / first_xbox_sync / first_playstation_sync / first_switch_sync: same reasoning
 *     as library sync - a GameOwnership platform claim doesn't record *how* it was added (Playnite
 *     sync vs. the Add Game modal vs. a room's manual toggle), so there's nothing to check.
 *   - first_full_house: requires "every member had voted" to have been true at some past moment;
 *     the current vote list only reflects the game's state right now; someone could've un-voted
 *     since, so a game with all-current-votes today isn't reliable evidence it happened before.
 *   - first_promoted: RoomMember.role has no history of who changed it or when - no way to tell a
 *     self-serve creator's Room Master role from an actual promotion by someone else.
 *   - first_spin_winner: RoomSpin rows are deleted once resolved (see routes/roomSpin.ts) - no
 *     historical spin data survives to recompute a past winner from.
 *   - first_backlog_buster: by definition only applies to a game that's since left 'backlog'
 *     status, but wasNeglectedBacklogGame (routes/games.ts) needs to see it *while* still in that
 *     status to judge neglect - there's no persisted "was neglected when it left" signal left
 *     behind afterward.
 *   - first_patient: same class of problem as first_backlog_buster - Game.targetPrice is cleared
 *     back to null the moment an alert fires, indistinguishable from "never set" (see
 *     priceAlerts.ts), and Notification has no gameId to correlate a past alert back to a game.
 *   - first_anniversary: doesn't need backfilling - jobs/anniversaryBadgeJob.ts runs immediately on
 *     every server boot (see scheduler.ts's runImmediately default) and scans every existing user,
 *     so it already catches anyone who crossed their anniversary before this badge shipped.
 *
 * Idempotent (unlockBadge's own create-and-catch-unique-violation), so safe to re-run - it will
 * just no-op for every user who already has the badge, from this script or the normal hook path.
 * Also re-checks the first_full_collection capstone for every user this run touched, since a plain
 * unlockBadge() call (unlike unlockBadges()) doesn't trigger that check on its own.
 *
 * Usage (from server/): npm run backfill:badges [-- --dry-run]
 */

const DRY_RUN = process.argv.includes('--dry-run');

const SHELF_STATUS_BADGE_KEYS = {
  done: 'first_solo_beat',
  replay: 'first_replay',
  wishlist: 'first_wishlist',
} as const;

async function unlockOrLog(userId: string, key: BadgeKey, touched: Set<string>): Promise<boolean> {
  if (DRY_RUN) {
    console.log(`[dry-run] would unlock ${key} for user ${userId}`);
    return false;
  }
  const result = await unlockBadge(userId, key);
  if (result) touched.add(userId);
  return result !== null;
}

async function backfillShelfStatusBadges(touched: Set<string>): Promise<number> {
  const rows = await prisma.game.findMany({
    where: { roomId: null, status: { in: Object.keys(SHELF_STATUS_BADGE_KEYS) as (keyof typeof SHELF_STATUS_BADGE_KEYS)[] } },
    select: { addedBy: true, status: true },
    distinct: ['addedBy', 'status'],
  });

  let unlocked = 0;
  for (const row of rows) {
    const key = SHELF_STATUS_BADGE_KEYS[row.status as keyof typeof SHELF_STATUS_BADGE_KEYS];
    if (await unlockOrLog(row.addedBy, key, touched)) unlocked++;
  }
  return unlocked;
}

async function backfillRoomCreatedBadge(touched: Set<string>): Promise<number> {
  const rows = await prisma.room.findMany({ select: { createdBy: true }, distinct: ['createdBy'] });

  let unlocked = 0;
  for (const row of rows) {
    if (await unlockOrLog(row.createdBy, 'first_room_created', touched)) unlocked++;
  }
  return unlocked;
}

async function backfillTagAppliedBadge(touched: Set<string>): Promise<number> {
  const rows = await prisma.tag.findMany({ where: { games: { some: {} } }, select: { userId: true }, distinct: ['userId'] });

  let unlocked = 0;
  for (const row of rows) {
    if (await unlockOrLog(row.userId, 'first_tag_applied', touched)) unlocked++;
  }
  return unlocked;
}

/** Shared by the two Personal-Shelf completion badges below - groups shelf games by (owner, family
 * key) and returns the set of users with at least one fully-Beaten family of size >= 2, matching
 * completionBadgeKeys' own thresholds (routes/games.ts). */
function usersWithCompleteFamily(rows: { addedBy: string; familyKey: string; status: string }[]): Set<string> {
  const groups = new Map<string, { total: number; done: number }>();
  for (const row of rows) {
    const key = `${row.addedBy}:${row.familyKey}`;
    const g = groups.get(key) ?? { total: 0, done: 0 };
    g.total++;
    if (row.status === 'done') g.done++;
    groups.set(key, g);
  }
  const qualifying = new Set<string>();
  for (const [key, g] of groups) {
    if (g.total >= 2 && g.total === g.done) qualifying.add(key.split(':')[0]);
  }
  return qualifying;
}

async function backfillFranchiseFinisherBadge(touched: Set<string>): Promise<number> {
  const rows = await prisma.game.findMany({
    where: { roomId: null, igdbCollectionId: { not: null } },
    select: { addedBy: true, igdbCollectionId: true, status: true },
  });
  const qualifying = usersWithCompleteFamily(
    rows.map((r) => ({ addedBy: r.addedBy, familyKey: String(r.igdbCollectionId), status: r.status })),
  );

  let unlocked = 0;
  for (const userId of qualifying) {
    if (await unlockOrLog(userId, 'first_franchise_finished', touched)) unlocked++;
  }
  return unlocked;
}

async function backfillDlcCompletionistBadge(touched: Set<string>): Promise<number> {
  const rows = await prisma.game.findMany({
    where: { roomId: null },
    select: { id: true, addedBy: true, baseGameId: true, status: true },
  });
  const qualifying = usersWithCompleteFamily(
    rows.map((r) => ({ addedBy: r.addedBy, familyKey: r.baseGameId ?? r.id, status: r.status })),
  );

  let unlocked = 0;
  for (const userId of qualifying) {
    if (await unlockOrLog(userId, 'first_dlc_completionist', touched)) unlocked++;
  }
  return unlocked;
}

async function backfillBargainHunterBadge(touched: Set<string>): Promise<number> {
  const [ownershipRows, alertedGames] = await Promise.all([
    prisma.gameOwnership.findMany({ select: { userId: true, igdbId: true } }),
    prisma.game.findMany({ where: { roomId: null, notifiedAtlPrice: { not: null } }, select: { addedBy: true, igdbId: true } }),
  ]);
  const alertedSet = new Set(alertedGames.map((g) => `${g.addedBy}:${g.igdbId}`));
  const qualifying = new Set(ownershipRows.filter((row) => alertedSet.has(`${row.userId}:${row.igdbId}`)).map((row) => row.userId));

  let unlocked = 0;
  for (const userId of qualifying) {
    if (await unlockOrLog(userId, 'first_bargain_hunter', touched)) unlocked++;
  }
  return unlocked;
}

const MARATHONER_MS = 30 * 24 * 60 * 60 * 1000;

async function backfillMarathonerBadge(touched: Set<string>): Promise<number> {
  const entries = await prisma.playLog.findMany({
    where: { finishedAt: { not: null }, game: { roomId: null } },
    select: { startedAt: true, finishedAt: true, game: { select: { addedBy: true } } },
  });
  const qualifying = new Set(
    entries.filter((e) => e.finishedAt!.getTime() - e.startedAt.getTime() >= MARATHONER_MS).map((e) => e.game.addedBy),
  );

  let unlocked = 0;
  for (const userId of qualifying) {
    if (await unlockOrLog(userId, 'first_marathoner', touched)) unlocked++;
  }
  return unlocked;
}

async function backfillComebackBadge(touched: Set<string>): Promise<number> {
  const entries = await prisma.playLog.findMany({
    where: { finishedAt: { not: null }, game: { roomId: null } },
    select: { gameId: true, game: { select: { addedBy: true } } },
  });
  const finishedCountByGame = new Map<string, number>();
  const ownerByGame = new Map<string, string>();
  for (const entry of entries) {
    finishedCountByGame.set(entry.gameId, (finishedCountByGame.get(entry.gameId) ?? 0) + 1);
    ownerByGame.set(entry.gameId, entry.game.addedBy);
  }
  const qualifying = new Set<string>();
  for (const [gameId, count] of finishedCountByGame) {
    if (count >= 2) qualifying.add(ownerByGame.get(gameId)!);
  }

  let unlocked = 0;
  for (const userId of qualifying) {
    if (await unlockOrLog(userId, 'first_comeback', touched)) unlocked++;
  }
  return unlocked;
}

async function main() {
  console.log(DRY_RUN ? 'Badge backfill (dry run - no writes)...' : 'Badge backfill...');
  const touched = new Set<string>();

  const counts = {
    shelfStatus: await backfillShelfStatusBadges(touched),
    roomCreated: await backfillRoomCreatedBadge(touched),
    tagApplied: await backfillTagAppliedBadge(touched),
    franchiseFinisher: await backfillFranchiseFinisherBadge(touched),
    dlcCompletionist: await backfillDlcCompletionistBadge(touched),
    bargainHunter: await backfillBargainHunterBadge(touched),
    marathoner: await backfillMarathonerBadge(touched),
    comeback: await backfillComebackBadge(touched),
  };

  if (!DRY_RUN) {
    let capstoneCount = 0;
    for (const userId of touched) {
      if (await maybeUnlockFullCollection(userId)) capstoneCount++;
    }
    console.log(
      `Done. Newly unlocked: ${counts.shelfStatus} shelf-status, ${counts.roomCreated} first_room_created, ` +
        `${counts.tagApplied} first_tag_applied, ${counts.franchiseFinisher} first_franchise_finished, ` +
        `${counts.dlcCompletionist} first_dlc_completionist, ${counts.bargainHunter} first_bargain_hunter, ` +
        `${counts.marathoner} first_marathoner, ${counts.comeback} first_comeback, ${capstoneCount} first_full_collection.`,
    );
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
