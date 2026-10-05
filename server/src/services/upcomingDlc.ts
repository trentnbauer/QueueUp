import { prisma } from '../db/client.js';
import { getUpcomingGameDlcs } from './igdbClient.js';
import { mapWithConcurrency } from './priceService.js';
import type { UpcomingDlc } from '@queueup/shared';

/** Same window as the Coming soon strip. */
export const UPCOMING_DLC_DAYS = 30;
/** Most owned games checked per request. IGDB answers are cached for a day, so a repeat is cheap. */
const MAX_BASE_GAMES = 100;
const MAX_CONCURRENCY = 3;

export interface UpcomingDlcSource {
  baseGameId: string;
  baseGameTitle: string;
  dlcs: Omit<UpcomingDlc, 'baseGameId' | 'baseGameTitle'>[];
}

/** Pure: flattens each owned game's upcoming DLC into one list, leaving out anything already on the
 * shelf (any status, so a wishlisted DLC is not offered again) or ignored, and any DLC listed under
 * two base games (first one wins). Soonest first. */
export function pickUpcomingDlc(sources: UpcomingDlcSource[], onShelfIgdbIds: ReadonlySet<number>, ignoredIgdbIds: ReadonlySet<number>): UpcomingDlc[] {
  const seen = new Set<number>();
  const out: UpcomingDlc[] = [];
  for (const { baseGameId, baseGameTitle, dlcs } of sources) {
    for (const d of dlcs) {
      if (onShelfIgdbIds.has(d.igdbId) || ignoredIgdbIds.has(d.igdbId) || seen.has(d.igdbId)) continue;
      seen.add(d.igdbId);
      out.push({ ...d, baseGameId, baseGameTitle });
    }
  }
  return out.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}

/** DLC and expansions releasing in the next 30 days for games the person owns on their shelf
 * (anything but wishlist; a DLC card itself has no DLC of its own here). A failed IGDB lookup for one
 * game just leaves it out. */
export async function getUpcomingOwnedDlc(userId: string, now: Date = new Date()): Promise<UpcomingDlc[]> {
  const [bases, shelf, ignored] = await Promise.all([
    prisma.game.findMany({
      where: { roomId: null, addedBy: userId, baseGameId: null, status: { not: 'wishlist' }, archivedAt: null },
      select: { id: true, igdbId: true, title: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_BASE_GAMES,
    }),
    prisma.game.findMany({ where: { roomId: null, addedBy: userId }, select: { igdbId: true } }),
    prisma.ignoredDlc.findMany({ where: { userId }, select: { igdbId: true } }),
  ]);
  const to = new Date(now.getTime() + UPCOMING_DLC_DAYS * 24 * 60 * 60 * 1000);
  const sources = await mapWithConcurrency(bases, MAX_CONCURRENCY, async (g): Promise<UpcomingDlcSource> => {
    try {
      return { baseGameId: g.id, baseGameTitle: g.title, dlcs: await getUpcomingGameDlcs(g.igdbId, now, to) };
    } catch {
      return { baseGameId: g.id, baseGameTitle: g.title, dlcs: [] };
    }
  });
  return pickUpcomingDlc(sources, new Set(shelf.map((s) => s.igdbId)), new Set(ignored.map((i) => i.igdbId)));
}

/** "Ignore" in the Coming soon strip: the DLC is not offered again. */
export async function ignoreDlc(userId: string, igdbId: number): Promise<void> {
  await prisma.ignoredDlc.upsert({ where: { userId_igdbId: { userId, igdbId } }, create: { userId, igdbId }, update: {} });
}
