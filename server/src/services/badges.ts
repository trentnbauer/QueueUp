import { Prisma } from '@prisma/client';
import { ALL_BADGE_KEYS, BADGE_DEFINITIONS, PLATFORM_SYNC_BADGE_KEY, type BadgeDefinition, type BadgeKey } from '@queueup/shared';
import { prisma } from '../db/client.js';

// Everything except the capstone itself - see maybeUnlockFullCollection below.
const NON_CAPSTONE_BADGE_KEYS = ALL_BADGE_KEYS.filter((key) => key !== 'first_full_collection');

/** Records a user unlocking a QueueUp badge (issue #489), idempotently - the unique constraint on
 * (userId, badgeKey) is the single source of truth for "was this already unlocked", same
 * create-and-catch-P2002 idiom already used for room joins (routes/rooms.ts), rather than a
 * check-then-insert that could race. Returns the badge's definition when this call is the one that
 * newly unlocked it (so the caller can surface a toast/animation), or null when the user already
 * had it - never throws for the "already unlocked" case, only for a genuine, unexpected DB error.
 * Callers should wrap this in try/catch and swallow failures (matching notifications.ts's own
 * defensive style) - a badge-unlock failure must never break the real action that triggered it. */
export async function unlockBadge(userId: string, key: BadgeKey): Promise<BadgeDefinition | null> {
  try {
    await prisma.userBadge.create({ data: { userId, badgeKey: key } });
    return BADGE_DEFINITIONS[key];
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

/** Convenience for a hook point that may unlock more than one badge from a single action (e.g. a
 * status change can be a solo-beat and nothing else, but keeps the call sites uniform) - runs each
 * unlock independently (allSettled, not all) so one key's unexpected failure can't discard another
 * key's successful unlock in the same batch, and filters out the nulls/rejections, so callers can
 * just spread the result into their response's `unlockedBadges` without checking each one
 * individually. Failures are swallowed and logged here (not left to each call site to remember)
 * since a badge unlock should never fail the request that triggered it.
 *
 * Also checks the Full Collection capstone once, after the real batch - not per-key, and not
 * inside unlockBadge itself, specifically so a capstone unlock earned by *this* call lands in the
 * same returned array (and therefore the same toast) as whatever just completed the set, rather
 * than only showing up next time the panel is checked. */
export async function unlockBadges(userId: string, keys: BadgeKey[]): Promise<BadgeDefinition[]> {
  const results = await Promise.allSettled(keys.map((key) => unlockBadge(userId, key)));
  const unlocked: BadgeDefinition[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      if (result.value) unlocked.push(result.value);
    } else {
      console.error('[badges] failed to unlock badge', { userId, key: keys[i], err: result.reason });
    }
  });

  if (unlocked.length > 0 && !keys.includes('first_full_collection')) {
    const capstone = await maybeUnlockFullCollection(userId);
    if (capstone) unlocked.push(capstone);
  }

  return unlocked;
}

/** Unlocks the Full Collection capstone (issue: "what other achievements can you think of") once
 * a user has every other badge - deliberately a separate, explicit check rather than folded into
 * unlockBadge itself, so it can be called both from the normal per-action flow above and, once
 * only, from the end of a full backfill run (see scripts/backfillBadges.ts) without recursing on
 * every single badge that script grants. Safe to call speculatively (e.g. from a scheduled job or
 * the backfill script sweeping every user) - unlockBadge's own idempotency means a user who
 * already has it, or doesn't yet qualify, just gets a no-op here. */
export async function maybeUnlockFullCollection(userId: string): Promise<BadgeDefinition | null> {
  const owned = await prisma.userBadge.count({ where: { userId, badgeKey: { in: NON_CAPSTONE_BADGE_KEYS } } });
  if (owned < NON_CAPSTONE_BADGE_KEYS.length) return null;
  return unlockBadge(userId, 'first_full_collection');
}

// --- refreshBadges: the per-user, on-demand counterpart to scripts/backfillBadges.ts below. Each
// helper mirrors one of that script's backfill* functions, scoped to a single userId instead of
// swept across every user - see that script's own doc comment for the "unambiguous from data on
// file" reasoning behind which badges can be re-derived this way at all, and which can't.

const SHELF_STATUS_BADGE_KEYS = {
  done: 'first_solo_beat',
  replay: 'first_replay',
  wishlist: 'first_wishlist',
} as const;

async function shelfStatusBadgeKeys(userId: string): Promise<BadgeKey[]> {
  const rows = await prisma.game.findMany({
    where: { roomId: null, addedBy: userId, status: { in: Object.keys(SHELF_STATUS_BADGE_KEYS) as (keyof typeof SHELF_STATUS_BADGE_KEYS)[] } },
    select: { status: true },
    distinct: ['status'],
  });
  return rows.map((r) => SHELF_STATUS_BADGE_KEYS[r.status as keyof typeof SHELF_STATUS_BADGE_KEYS]);
}

async function roomCreatedBadgeKeys(userId: string): Promise<BadgeKey[]> {
  const room = await prisma.room.findFirst({ where: { createdBy: userId }, select: { id: true } });
  return room ? ['first_room_created'] : [];
}

async function tagAppliedBadgeKeys(userId: string): Promise<BadgeKey[]> {
  const tag = await prisma.tag.findFirst({ where: { userId, games: { some: {} } }, select: { id: true } });
  return tag ? ['first_tag_applied'] : [];
}

/** Shared by the two Personal-Shelf completion badges below - true when at least one (owner,
 * family) group has every member Beaten and at least 2 members total, matching
 * completionBadgeKeys' own thresholds (routes/games.ts) and backfillBadges.ts's
 * usersWithCompleteFamily. */
function hasCompleteFamily(rows: { familyKey: string; status: string }[]): boolean {
  const groups = new Map<string, { total: number; done: number }>();
  for (const row of rows) {
    const g = groups.get(row.familyKey) ?? { total: 0, done: 0 };
    g.total++;
    if (row.status === 'done') g.done++;
    groups.set(row.familyKey, g);
  }
  for (const g of groups.values()) {
    if (g.total >= 2 && g.total === g.done) return true;
  }
  return false;
}

async function franchiseFinisherBadgeKeys(userId: string): Promise<BadgeKey[]> {
  const rows = await prisma.game.findMany({
    where: { roomId: null, addedBy: userId, igdbCollectionId: { not: null } },
    select: { igdbCollectionId: true, status: true },
  });
  const qualifies = hasCompleteFamily(rows.map((r) => ({ familyKey: String(r.igdbCollectionId), status: r.status })));
  return qualifies ? ['first_franchise_finished'] : [];
}

async function dlcCompletionistBadgeKeys(userId: string): Promise<BadgeKey[]> {
  const rows = await prisma.game.findMany({
    where: { roomId: null, addedBy: userId },
    select: { id: true, baseGameId: true, status: true },
  });
  const qualifies = hasCompleteFamily(rows.map((r) => ({ familyKey: r.baseGameId ?? r.id, status: r.status })));
  return qualifies ? ['first_dlc_completionist'] : [];
}

async function bargainHunterBadgeKeys(userId: string): Promise<BadgeKey[]> {
  const [ownershipRows, alertedGames] = await Promise.all([
    prisma.gameOwnership.findMany({ where: { userId }, select: { igdbId: true } }),
    prisma.game.findMany({ where: { roomId: null, addedBy: userId, notifiedAtlPrice: { not: null } }, select: { igdbId: true } }),
  ]);
  const alertedIgdbIds = new Set(alertedGames.map((g) => g.igdbId));
  return ownershipRows.some((row) => alertedIgdbIds.has(row.igdbId)) ? ['first_bargain_hunter'] : [];
}

const MARATHONER_MS = 30 * 24 * 60 * 60 * 1000;
const QUICK_DROP_MS = 24 * 60 * 60 * 1000;

/** Marathoner/Comeback/Not For Me all derive from the same PlayLog scan, same reasoning as
 * backfillBadges.ts keeping them as separate functions over the same underlying table - kept as
 * one query here purely to avoid three near-identical round trips for one user. */
async function playLogDerivedBadgeKeys(userId: string): Promise<BadgeKey[]> {
  const entries = await prisma.playLog.findMany({
    where: { finishedAt: { not: null }, game: { roomId: null, addedBy: userId } },
    select: { gameId: true, startedAt: true, finishedAt: true, game: { select: { status: true } } },
  });

  const keys: BadgeKey[] = [];
  if (entries.some((e) => e.finishedAt!.getTime() - e.startedAt.getTime() >= MARATHONER_MS)) keys.push('first_marathoner');

  const finishedCountByGame = new Map<string, number>();
  for (const e of entries) finishedCountByGame.set(e.gameId, (finishedCountByGame.get(e.gameId) ?? 0) + 1);
  if ([...finishedCountByGame.values()].some((count) => count >= 2)) keys.push('first_comeback');

  // Same narrower signal as backfillQuickDropBadge - a closed PlayLog entry alone doesn't say
  // whether the transition that closed it was Done or Dropped, so this also requires the game's
  // *current* status to still be 'dropped'.
  const isQuickDrop = entries.some((e) => {
    if (e.game.status !== 'dropped') return false;
    const durationMs = e.finishedAt!.getTime() - e.startedAt.getTime();
    return durationMs > 0 && durationMs < QUICK_DROP_MS;
  });
  if (isQuickDrop) keys.push('first_quick_drop');

  return keys;
}

/** The one deliberate departure from backfillBadges.ts's "unambiguous or skip" bar (see that
 * script's doc comment on why it declines these four): a GameOwnership platform claim doesn't
 * record *how* it was added, so this can't tell a real Playnite sync apart from a manual ownership
 * toggle. Granting based on current ownership anyway is the whole point of this being a user-
 * triggered button rather than an automatic sweep - someone who already owns a Switch game and
 * wants credit for it has no other path to it without re-running an actual sync, and "you
 * currently own something on this platform" is a reasonable-enough proxy for "you've synced from
 * it" that the button exists to accept. */
async function platformSyncBadgeKeys(userId: string): Promise<BadgeKey[]> {
  const rows = await prisma.gameOwnership.findMany({ where: { userId }, select: { platforms: true } });
  const keys = new Set<BadgeKey>();
  for (const row of rows) {
    for (const platform of row.platforms) keys.add(PLATFORM_SYNC_BADGE_KEY[platform]);
  }
  return [...keys];
}

/** Re-derives every badge a user currently, unambiguously qualifies for but hasn't been credited
 * with yet - the on-demand, per-user counterpart to scripts/backfillBadges.ts, triggered from the
 * Achievements panel's "Refresh Achievements" button rather than swept across every user from a
 * CLI script. Covers the same subset that script backfills, plus the platform-sync badges it
 * deliberately skips (see platformSyncBadgeKeys above for why this button can afford to be looser
 * about that one). Safe to call repeatedly - unlockBadges' own idempotency means already-unlocked
 * badges just no-op, and nothing here writes anything until the final unlockBadges call. */
export async function refreshBadges(userId: string): Promise<BadgeDefinition[]> {
  const keyLists = await Promise.all([
    shelfStatusBadgeKeys(userId),
    roomCreatedBadgeKeys(userId),
    tagAppliedBadgeKeys(userId),
    franchiseFinisherBadgeKeys(userId),
    dlcCompletionistBadgeKeys(userId),
    bargainHunterBadgeKeys(userId),
    playLogDerivedBadgeKeys(userId),
    platformSyncBadgeKeys(userId),
  ]);
  const keys = [...new Set(keyLists.flat())];
  return unlockBadges(userId, keys);
}
