import { prisma } from '../db/client.js';
import { gameInclude, type GameWithRelations } from '../services/gameSerializer.js';
import { getSteamPrices } from '../services/priceService.js';
import { runPriceAlertChecks } from '../services/priceAlerts.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

// Matches priceService.ts's own PRICE_CACHE_TTL_SECONDS (6h) - checking more often than the price
// cache itself refreshes would just re-read the same cached value and re-run the same (already
// cheap) DB-side gating with nothing new to find; any less often widens the window where a drop
// sits unnoticed in a quiet room. Kept independent (not imported) since priceService's constant is
// private to its own caching concern - this one is a scheduling concern that just happens to want
// the same cadence.
export const PRICE_ALERT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Re-runs the same alert checks gameSerializer.ts runs opportunistically on page view (see
 * priceAlerts.ts / #255), for every game that could plausibly have an active watch, independent of
 * whether anyone has viewed it. "Could plausibly" = has a Steam App ID at all (drop alerts also
 * need targetPrice set, but that gating already lives in runPriceAlertChecks - see priceAlerts.ts
 * - and duplicating it in this query would just be two places that can drift) and isn't archived
 * (archived games are already hidden from every shelf/room listing, so alerting on them would
 * surface a game the user no longer sees anywhere in the app). Batched through getSteamPrices,
 * same as a real room/shelf listing, so this only takes a live gg.deals hit for whichever games'
 * 6h cache has actually expired - not one API call per watched game every run. */
export async function checkAllActivePriceWatches(): Promise<void> {
  const games = await prisma.game.findMany({
    where: { steamAppid: { not: null }, archivedAt: null },
    include: gameInclude,
  });
  if (games.length === 0) return;

  const steamAppIds = games.map((g) => g.steamAppid).filter((id): id is number => id != null);
  const prices = await getSteamPrices(steamAppIds);

  await Promise.all(
    games.map((game) => {
      const price = game.steamAppid != null ? prices.get(game.steamAppid) : undefined;
      if (!price) return Promise.resolve();
      return runPriceAlertChecks(game as GameWithRelations, price);
    }),
  );
}

/** Registers the price-watch check to run on its own schedule, independent of page views (#255).
 * See jobs/scheduler.ts for why this is a plain in-process interval rather than a cron container:
 * unlike the Postgres backup job (#250), this one needs the running app's own Prisma/Redis clients
 * and existing alert-delivery code, not an external OS tool. */
export function startPriceAlertJob(): JobHandle {
  return scheduleJob({
    name: 'price-alert-check',
    intervalMs: PRICE_ALERT_CHECK_INTERVAL_MS,
    run: checkAllActivePriceWatches,
  });
}
