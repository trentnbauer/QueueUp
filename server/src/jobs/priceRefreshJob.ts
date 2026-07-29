import { prisma } from '../db/client.js';
import { getSteamPrices, getSteamPriceAndUrl } from '../services/priceService.js';
import { getRoomPlatforms } from '../services/roomAccess.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

// Shorter than priceAlertJob's 6h (matching the price cache TTL) on purpose (issue #439) - this
// job's value beyond what the cache/alert job already do is a second chance for a game whose
// price never got warmed on a prior run (an API hiccup, a game added between ticks), not
// outrunning the cache TTL itself. 3h halves that worst-case gap without meaningfully changing
// live gg.deals call volume, since an already-cached game is still a no-op fetch either way.
export const PRICE_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;

type RefreshableGame = { id: string; roomId: string | null; steamAppid: number | null; ggDealsUrl: string | null };

/** Warms the price cache for every non-archived PC game with a Steam match, system-wide -
 * independent of any page view, same "not just on-click" motivation as priceAlertJob.ts (#255),
 * this time for issue #439 ("prices often need to be manually refreshed"). Most of what #439 asks
 * for was already a side effect of priceAlertJob's own 6h sweep (getSteamPrices warms the cache
 * regardless of why it was called) - what's actually new here:
 *
 * 1. A game whose ggDealsUrl came back null from a transient intake failure stays null forever
 *    otherwise - a normal page view re-fetches its *price* fine (see gameSerializer.ts) but never
 *    re-persists ggDealsUrl, only the manual "Refresh price" button (refreshGamePricing) does.
 *    This job closes that gap automatically.
 * 2. Games with no ggDealsUrl yet are refreshed first, ahead of already-priced games - if a run
 *    gets cut short (a restart, an API outage), progress favors games currently showing nothing
 *    over re-warming ones that already have a number. Note this is a proxy, not a perfect "has no
 *    price" signal (a resolved gg.deals URL can still carry no current price), and a game gg.deals
 *    genuinely never lists gets retried at the front of the queue every run, indefinitely - an
 *    accepted tradeoff given #439 only asks for this "if possible."
 *
 * An explicit "refresh on login" trigger was considered and deliberately not added: with this job
 * already running on startup and every 3h, a per-login refresh would only ever find a game added
 * or expired in the gap since the last global tick - a narrow win not worth the new per-user
 * cooldown state it'd require to keep /api/me (hit on every app load) from re-triggering it
 * constantly. */
export async function refreshStaleGamePrices(): Promise<void> {
  const games = await prisma.game.findMany({
    where: { steamAppid: { not: null }, archivedAt: null },
    select: { id: true, roomId: true, steamAppid: true, ggDealsUrl: true },
  });
  if (games.length === 0) return;

  // gg.deals (our only price source) is Steam-App-ID-based, i.e. PC-only - same room-platform
  // scoping as priceAlertJob.ts, so a room on another platform's games are never fetched here.
  const roomIds = games.map((g) => g.roomId).filter((id): id is string => id != null);
  const roomPlatforms = await getRoomPlatforms(roomIds);
  const isPcGame = (g: RefreshableGame) => (g.roomId ? roomPlatforms.get(g.roomId) : 'pc') === 'pc';
  const pcGames = games.filter(isPcGame);

  const noUrlYet = pcGames.filter((g) => g.ggDealsUrl === null);
  const alreadyResolved = pcGames.filter((g) => g.ggDealsUrl !== null);

  await Promise.all(
    noUrlYet.map(async (game) => {
      if (game.steamAppid == null) return;
      const { ggDealsUrl } = await getSteamPriceAndUrl(game.steamAppid);
      if (ggDealsUrl) {
        await prisma.game.update({ where: { id: game.id }, data: { ggDealsUrl } });
      }
    }),
  );

  const alreadyResolvedIds = alreadyResolved.map((g) => g.steamAppid).filter((id): id is number => id != null);
  await getSteamPrices(alreadyResolvedIds);
}

/** Registers the price-warming sweep to run on its own schedule (on startup, then every
 * PRICE_REFRESH_INTERVAL_MS) - see jobs/scheduler.ts for why this is a plain in-process interval,
 * and priceAlertJob.ts for the sibling job this deliberately doesn't merge into (same mechanism,
 * different purpose: this one exists to keep prices generally warm, not to detect alert-worthy
 * drops). */
export function startPriceRefreshJob(): JobHandle {
  return scheduleJob({
    name: 'price-refresh',
    intervalMs: PRICE_REFRESH_INTERVAL_MS,
    run: refreshStaleGamePrices,
  });
}
