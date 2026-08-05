import type { ReleaseWatchKind } from '@prisma/client';
import { prisma } from '../db/client.js';
import { getCollectionGames, getGameDlcs } from './igdbClient.js';
import { mapWithConcurrency } from './priceService.js';
import { notifyReleaseWatch } from './notifications.js';

// Bounded IGDB fan-out, same reasoning/shape as priceService.ts's gg.deals batching (issue #523) -
// this job is IGDB-bound (getCollectionGames isn't cached, unlike getGameDlcs's own 24h Redis
// cache), so a low concurrency cap plus deduping to one IGDB call per unique collection/base game
// per run (never per user, per beaten game - see checkReleaseWatches) keeps this comfortably under
// IGDB's rate limits even as the user base grows. Resolves the "main open question" from issue
// #510's own description.
const RELEASE_WATCH_MAX_CONCURRENCY = 3;

export interface ReleaseWatchCandidate {
  igdbId: number;
  title: string;
}

export interface ReleaseWatchDiscovery extends ReleaseWatchCandidate {
  kind: ReleaseWatchKind;
  /** The user's own beaten game that led IGDB to this candidate (e.g. "Portal" for a "Portal 2"
   * sequel discovery, or "Half-Life 2" for a newly-listed piece of its DLC) - not necessarily
   * unique across a user's discoveries in one run, if more than one beaten game pointed at the
   * same collection/base game. */
  sourceTitle: string;
}

/** Pure diff: which of `candidates` (a collection's games, or a base game's DLC list) are
 * genuinely new to this user - not already anywhere on their Personal Shelf (any status; already
 * wishlisted/queued counts as "already knows about it"), and not already notified about in a past
 * run. Exported and unit-tested standalone from the DB/IGDB-touching orchestration below. */
export function diffNewReleaseWatchCandidates(
  candidates: ReleaseWatchCandidate[],
  kind: ReleaseWatchKind,
  sourceTitle: string,
  ownedIgdbIds: ReadonlySet<number>,
  alreadyNotifiedIgdbIds: ReadonlySet<number>,
): ReleaseWatchDiscovery[] {
  return candidates
    .filter((c) => !ownedIgdbIds.has(c.igdbId) && !alreadyNotifiedIgdbIds.has(c.igdbId))
    .map((c) => ({ ...c, kind, sourceTitle }));
}

const MAX_TITLES_IN_MESSAGE = 3;

/** Builds the single notification message for however many discoveries fired for one user in one
 * run - bundled into one notification rather than one per title, so a user with several beaten
 * franchises doesn't get spammed the first time this job ever runs against their account (or after
 * it's been down a while and catches up on more than one release at once). */
export function formatReleaseWatchMessage(discoveries: ReleaseWatchDiscovery[]): string {
  if (discoveries.length === 1) {
    const d = discoveries[0];
    const noun = d.kind === 'sequel' ? 'A new release' : 'New DLC';
    return `${noun} showed up for "${d.sourceTitle}": "${d.title}"`;
  }
  const shown = discoveries.slice(0, MAX_TITLES_IN_MESSAGE).map((d) => `"${d.title}"`);
  const rest = discoveries.length - shown.length;
  const list = rest > 0 ? `${shown.join(', ')}, and ${rest} more` : shown.join(', ');
  return `${discoveries.length} new releases showed up for games you've beaten: ${list}`;
}

interface BeatenGameSource {
  userId: string;
  sourceTitle: string;
}

/** Groups sources by their shared IGDB lookup key (collection id / base game igdb id), not by
 * user or by beaten game - two different users who both beat the same game, or one user with two
 * beaten entries from the same franchise, should still only cost one IGDB call each, not one per
 * beaten game. */
function groupSourcesByKey<T extends { userId: string; sourceTitle: string }>(rows: (T & { key: number })[]): Map<number, BeatenGameSource[]> {
  const grouped = new Map<number, BeatenGameSource[]>();
  for (const row of rows) {
    const list = grouped.get(row.key) ?? [];
    list.push({ userId: row.userId, sourceTitle: row.sourceTitle });
    grouped.set(row.key, list);
  }
  return grouped;
}

function groupIgdbIdsByUser(rows: { userId: string; igdbId: number }[]): Map<string, Set<number>> {
  const grouped = new Map<string, Set<number>>();
  for (const row of rows) {
    const set = grouped.get(row.userId) ?? new Set<number>();
    set.add(row.igdbId);
    grouped.set(row.userId, set);
  }
  return grouped;
}

/** Release/DLC watch alerts (issue #510) - notifies a user when a sequel or new DLC entry shows up
 * on IGDB for a game they've already beaten, reusing the same IGDB collection/DLC data already
 * fetched for the Franchise Finisher / DLC Completionist badges (badges.ts). Personal Shelf only,
 * same scope as those two badges (roomId: null) - a room game isn't "yours" the same way, and
 * mixing room-scoped and personal-scoped beaten games into one alert would blur whose watch this
 * actually is. */
export async function checkReleaseWatches(): Promise<void> {
  const [sequelSourceRows, dlcSourceRows] = await Promise.all([
    prisma.game.findMany({
      where: { roomId: null, status: 'done', igdbCollectionId: { not: null } },
      select: { addedBy: true, igdbCollectionId: true, title: true },
    }),
    // Base games only (baseGameId null) - a beaten DLC entry itself has no further DLC of its own
    // to check in this data model, same domain assumption dlcCompletionistBadgeKeys makes.
    prisma.game.findMany({
      where: { roomId: null, status: 'done', baseGameId: null },
      select: { addedBy: true, igdbId: true, title: true },
    }),
  ]);
  if (sequelSourceRows.length === 0 && dlcSourceRows.length === 0) return;

  const userIds = Array.from(new Set([...sequelSourceRows.map((r) => r.addedBy), ...dlcSourceRows.map((r) => r.addedBy)]));

  const [ownedRows, notifiedRows] = await Promise.all([
    prisma.game.findMany({ where: { roomId: null, addedBy: { in: userIds } }, select: { addedBy: true, igdbId: true } }),
    prisma.releaseWatchNotification.findMany({ where: { userId: { in: userIds } }, select: { userId: true, igdbId: true } }),
  ]);
  const ownedByUser = groupIgdbIdsByUser(ownedRows.map((r) => ({ userId: r.addedBy, igdbId: r.igdbId })));
  const notifiedByUser = groupIgdbIdsByUser(notifiedRows);

  const sequelSourcesByCollection = groupSourcesByKey(
    sequelSourceRows.map((r) => ({ key: r.igdbCollectionId!, userId: r.addedBy, sourceTitle: r.title })),
  );
  const dlcSourcesByBaseGame = groupSourcesByKey(dlcSourceRows.map((r) => ({ key: r.igdbId, userId: r.addedBy, sourceTitle: r.title })));

  const discoveriesByUser = new Map<string, ReleaseWatchDiscovery[]>();
  const recordDiscoveries = (userId: string, found: ReleaseWatchDiscovery[]) => {
    if (found.length === 0) return;
    const list = discoveriesByUser.get(userId) ?? [];
    list.push(...found);
    discoveriesByUser.set(userId, list);
  };

  await mapWithConcurrency(Array.from(sequelSourcesByCollection.entries()), RELEASE_WATCH_MAX_CONCURRENCY, async ([collectionId, sources]) => {
    let games: ReleaseWatchCandidate[];
    try {
      games = (await getCollectionGames(collectionId)).games;
    } catch (err) {
      console.error('[releaseWatch] failed to fetch collection', { collectionId, err });
      return;
    }
    for (const { userId, sourceTitle } of sources) {
      recordDiscoveries(
        userId,
        diffNewReleaseWatchCandidates(games, 'sequel', sourceTitle, ownedByUser.get(userId) ?? new Set(), notifiedByUser.get(userId) ?? new Set()),
      );
    }
  });

  await mapWithConcurrency(Array.from(dlcSourcesByBaseGame.entries()), RELEASE_WATCH_MAX_CONCURRENCY, async ([baseIgdbId, sources]) => {
    let dlcs: ReleaseWatchCandidate[];
    try {
      dlcs = await getGameDlcs(baseIgdbId);
    } catch (err) {
      console.error('[releaseWatch] failed to fetch DLC list', { baseIgdbId, err });
      return;
    }
    for (const { userId, sourceTitle } of sources) {
      recordDiscoveries(
        userId,
        diffNewReleaseWatchCandidates(dlcs, 'dlc', sourceTitle, ownedByUser.get(userId) ?? new Set(), notifiedByUser.get(userId) ?? new Set()),
      );
    }
  });

  for (const [userId, discoveries] of discoveriesByUser) {
    // The same igdbId could theoretically surface twice for one user (e.g. two beaten games in
    // the same collection both pointing at the same not-yet-added sequel) - keyed by igdbId within
    // this one user's own run, first occurrence wins.
    const seen = new Set<number>();
    const deduped = discoveries.filter((d) => {
      if (seen.has(d.igdbId)) return false;
      seen.add(d.igdbId);
      return true;
    });
    if (deduped.length === 0) continue;

    try {
      // Recorded *before* notifying, not after - if the notification write below fails, the next
      // run must not re-discover and re-attempt the same title (see notifyReleaseWatch's own doc
      // comment on why it swallows its errors instead of retrying).
      await prisma.releaseWatchNotification.createMany({
        data: deduped.map((d) => ({ userId, igdbId: d.igdbId, kind: d.kind })),
        skipDuplicates: true,
      });
    } catch (err) {
      console.error('[releaseWatch] failed to record notified releases', { userId, err });
      continue;
    }
    await notifyReleaseWatch(userId, formatReleaseWatchMessage(deduped));
  }
}
