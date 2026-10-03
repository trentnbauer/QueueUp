import type { GamePrice } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { notifyPriceDrop } from './notifications.js';
import { isOwnedBy } from './gameOwnership.js';
import { unlockBadges } from './badges.js';
import type { GameWithRelations } from './gameSerializer.js';
import { goodTimeReason, getPriceHistory, isMeaningfulFurtherDrop, usualPrice } from './priceHistory.js';
import { isInAppEnabled } from './notificationPreferences.js';
import { notifyGoodTimeToBuy } from './notifications.js';

/** Called (by runPriceAlertChecks' callers - see priceAlertJob.ts) exactly when a check below
 * actually fires a fresh alert - not on every game checked, and not on a re-check that found
 * nothing new. Lets a caller batch same-run fires into something bigger (the Wishlist bundle
 * digest, #570's follow-up) without either alert check needing to know that batching exists. */
type OnAlertFired = (game: GameWithRelations) => void;

/** Compares a freshly-computed live price against a game's target price and fires a one-shot
 * alert once it's been met. The target is atomically cleared as part of the same check (a
 * conditional update matched on its current value), so two concurrent page loads racing on the
 * same drop can't both fire, and a price that stays low afterward doesn't re-notify on every
 * subsequent load. Only acts on live prices - 'unavailable' carries no real number to compare. */
export async function checkPriceDropAlert(game: GameWithRelations, price: GamePrice, onFired?: OnAlertFired): Promise<void> {
  const targetPrice = game.targetPrice;
  if (!targetPrice || price.source !== 'live' || !price.amount) return;
  if (Number(price.amount) > Number(targetPrice)) return;

  const room = game.roomId ? await prisma.room.findUnique({ where: { id: game.roomId }, select: { name: true, platform: true } }) : null;
  // A target price set before the game was marked owned (or before a Steam import surfaced
  // existing ownership) is stale intent, not a live "should I buy this" question (#187) - scoped to
  // this room's own platform, so owning it on a different platform doesn't suppress a real alert
  // for the platform this room is actually tracking.
  if (await isOwnedBy(game.addedBy, game.igdbId, room?.platform ?? null)) return;

  try {
    const cleared = await prisma.game.updateMany({
      where: { id: game.id, targetPrice },
      data: { targetPrice: null },
    });
    if (cleared.count === 0) return;

    await notifyPriceDrop({
      gameId: game.id,
      title: game.title,
      amount: price.amount,
      currency: price.currency,
      room: room && game.roomId ? { roomId: game.roomId, roomName: room.name } : null,
      ownerId: game.addedBy,
    });
    onFired?.(game);

    // Patient (issue: "what other achievements can you think of") - a target price set on a
    // wishlisted game actually paid off. Scoped to 'wishlist' rather than every status, since a
    // target price left set on a game already Playing/Done/etc. isn't "waiting for the price to
    // drop" in the sense this badge is meant to reward.
    if (game.status === 'wishlist') await unlockBadges(game.addedBy, ['first_patient']);
  } catch (err) {
    console.error('[priceAlerts] failed to process price drop alert', err);
  }
}

/** Alerts when a game's live price hits (or beats) its all-time low - independent of whether a
 * target price is set (issue #178). `price.historicalLow` is the raw gg.deals value (null only
 * when there's genuinely no historical data at all - see priceService.ts), so "at a new low" is a
 * direct amount <= historicalLow comparison, distinct from "no data to compare against". Re-
 * notifies only if the price drops even further than the last ATL alert, via the same atomic-
 * conditional-update pattern as the target-price alert, so concurrent checks can't double-fire and
 * a price sitting at the same low doesn't re-notify on every subsequent page load. */
export async function checkAllTimeLowAlert(game: GameWithRelations, price: GamePrice, onFired?: OnAlertFired): Promise<void> {
  if (price.source !== 'live' || !price.amount || price.historicalLow === null) return;
  const amount = price.amount;
  if (Number(amount) > Number(price.historicalLow)) return;
  if (game.notifiedAtlPrice !== null && Number(amount) >= Number(game.notifiedAtlPrice)) return;

  const room = game.roomId ? await prisma.room.findUnique({ where: { id: game.roomId }, select: { name: true, platform: true } }) : null;
  // Owning the game already answers "should I buy it" - see #187 - scoped to this room's own
  // platform, same reasoning as checkPriceDropAlert above.
  if (await isOwnedBy(game.addedBy, game.igdbId, room?.platform ?? null)) return;

  try {
    const updated = await prisma.game.updateMany({
      where: { id: game.id, notifiedAtlPrice: game.notifiedAtlPrice },
      data: { notifiedAtlPrice: amount },
    });
    if (updated.count === 0) return;

    await notifyPriceDrop({
      gameId: game.id,
      title: game.title,
      amount,
      currency: price.currency,
      room: room && game.roomId ? { roomId: game.roomId, roomName: room.name } : null,
      ownerId: game.addedBy,
      reason: 'atl',
    });
    onFired?.(game);
  } catch (err) {
    console.error('[priceAlerts] failed to process all-time-low alert', err);
  }
}

/** "Good time to buy" for a wishlist game: its live price is near the lowest known price or well
 * under the usual one (see goodTimeReason). Fires once per dip: the price it fired at is stored, only
 * a meaningful further drop re-alerts (see isMeaningfulFurtherDrop - a few cents of jitter doesn't), and the marker clears when the price climbs back out of the good range so
 * the next dip alerts again. Owned games and games the person has switched this alert off for are
 * skipped. Independent of the target-price and all-time-low alerts, which can fire in the same run. */
export async function checkGoodTimeToBuy(game: GameWithRelations, price: GamePrice): Promise<void> {
  if (game.status !== 'wishlist' || game.steamAppid == null || price.source !== 'live' || !price.amount || !price.currency) return;
  const amount = Number(price.amount);
  const history = await getPriceHistory(game.steamAppid, price.currency);
  const reason = goodTimeReason(amount, history, price.historicalLow !== null ? Number(price.historicalLow) : null);

  if (!reason) {
    if (game.notifiedGoodTimePrice !== null) {
      await prisma.game.updateMany({ where: { id: game.id, notifiedGoodTimePrice: game.notifiedGoodTimePrice }, data: { notifiedGoodTimePrice: null } });
    }
    return;
  }
  if (!isMeaningfulFurtherDrop(amount, game.notifiedGoodTimePrice !== null ? Number(game.notifiedGoodTimePrice) : null)) return;
  if (await isOwnedBy(game.addedBy, game.igdbId, null)) return;

  try {
    const claimed = await prisma.game.updateMany({
      where: { id: game.id, notifiedGoodTimePrice: game.notifiedGoodTimePrice },
      data: { notifiedGoodTimePrice: price.amount },
    });
    if (claimed.count === 0) return;
    if (!(await isInAppEnabled(game.addedBy, 'good_time_to_buy'))) return;

    const usual = usualPrice(history);
    const now = `${price.amount} ${price.currency}`;
    const why = reason === 'near_low' ? 'at or near its lowest price' : usual !== null ? `well under its usual ${usual.toFixed(2)}` : 'well under its usual price';
    await notifyGoodTimeToBuy(game.addedBy, game.id, `Good time to buy "${game.title}": now ${now}, ${why}`);
  } catch (err) {
    console.error('[priceAlerts] failed to process good-time-to-buy alert', err);
  }
}

/** Runs both alert checks for a game against a freshly-resolved price, applying the same
 * "only a drop alert needs a target price set" gating every call site otherwise has to duplicate
 * (the all-time-low check has no such gate - see checkAllTimeLowAlert above). Called by the
 * scheduled job (jobs/priceAlertJob.ts, #255); page views no longer trigger it, so a list load
 * never pays for alert queries. */
export async function runPriceAlertChecks(game: GameWithRelations, price: GamePrice, onFired?: OnAlertFired): Promise<void> {
  await Promise.all([
    game.targetPrice ? checkPriceDropAlert(game, price, onFired) : Promise.resolve(),
    checkAllTimeLowAlert(game, price, onFired),
    checkGoodTimeToBuy(game, price),
  ]);
}
