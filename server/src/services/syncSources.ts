import type { SyncSource } from '@queueup/shared';
import { prisma } from '../db/client.js';

/** Notes that a game was seen by a sync (Steam library, Steam wishlist, Playnite, Xbox) for this person.
 * Keyed by igdbId like ownership, so it covers the shelf copy however the row was created. Best
 * effort: a failure here must never break the import that called it. */
export async function recordSyncSources(userId: string, igdbIds: number[], source: SyncSource): Promise<void> {
  const unique = [...new Set(igdbIds)];
  if (unique.length === 0) return;
  try {
    await prisma.gameSyncSource.createMany({ data: unique.map((igdbId) => ({ userId, igdbId, source })), skipDuplicates: true });
  } catch (err) {
    console.error('[syncSources] failed to record sync sources', err);
  }
}

const ORDER: SyncSource[] = ['steam', 'steam_wishlist', 'playnite', 'xbox'];

/** The syncs that have seen each of the viewer's own Personal Shelf games. Other games get []. */
export async function getSyncSources(
  games: { id: string; igdbId: number; roomId: string | null; addedBy: string }[],
  viewerId: string,
): Promise<Map<string, SyncSource[]>> {
  const shelf = games.filter((g) => g.roomId === null && g.addedBy === viewerId);
  const out = new Map<string, SyncSource[]>();
  if (shelf.length === 0) return out;
  const rows = await prisma.gameSyncSource.findMany({
    where: { userId: viewerId, igdbId: { in: shelf.map((g) => g.igdbId) } },
    select: { igdbId: true, source: true },
  });
  const byIgdb = new Map<number, Set<string>>();
  for (const r of rows) {
    const set = byIgdb.get(r.igdbId) ?? new Set<string>();
    set.add(r.source);
    byIgdb.set(r.igdbId, set);
  }
  for (const g of shelf) {
    const seen = byIgdb.get(g.igdbId);
    if (seen) out.set(g.id, ORDER.filter((s) => seen.has(s)));
  }
  return out;
}
