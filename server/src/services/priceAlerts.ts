import type { GamePrice } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { notifyPriceDrop } from './notifications.js';
import type { GameWithRelations } from './gameSerializer.js';

/** Compares a freshly-computed live price against a game's target price and fires a one-shot
 * alert once it's been met. The target is atomically cleared as part of the same check (a
 * conditional update matched on its current value), so two concurrent page loads racing on the
 * same drop can't both fire, and a price that stays low afterward doesn't re-notify on every
 * subsequent load. Only acts on live prices - 'unavailable' carries no real number to compare. */
export async function checkPriceDropAlert(game: GameWithRelations, price: GamePrice): Promise<void> {
  const targetPrice = game.targetPrice;
  if (!targetPrice || price.source !== 'live' || !price.amount) return;
  if (Number(price.amount) > Number(targetPrice)) return;

  try {
    const cleared = await prisma.game.updateMany({
      where: { id: game.id, targetPrice },
      data: { targetPrice: null },
    });
    if (cleared.count === 0) return;

    const room = game.roomId ? await prisma.room.findUnique({ where: { id: game.roomId }, select: { name: true } }) : null;
    await notifyPriceDrop({
      title: game.title,
      amount: price.amount,
      currency: price.currency,
      room: room && game.roomId ? { roomId: game.roomId, roomName: room.name } : null,
      ownerId: game.addedBy,
    });
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
export async function checkAllTimeLowAlert(game: GameWithRelations, price: GamePrice): Promise<void> {
  if (price.source !== 'live' || !price.amount || price.historicalLow === null) return;
  const amount = price.amount;
  if (Number(amount) > Number(price.historicalLow)) return;
  if (game.notifiedAtlPrice !== null && Number(amount) >= Number(game.notifiedAtlPrice)) return;

  try {
    const updated = await prisma.game.updateMany({
      where: { id: game.id, notifiedAtlPrice: game.notifiedAtlPrice },
      data: { notifiedAtlPrice: amount },
    });
    if (updated.count === 0) return;

    const room = game.roomId ? await prisma.room.findUnique({ where: { id: game.roomId }, select: { name: true } }) : null;
    await notifyPriceDrop({
      title: game.title,
      amount,
      currency: price.currency,
      room: room && game.roomId ? { roomId: game.roomId, roomName: room.name } : null,
      ownerId: game.addedBy,
      reason: 'atl',
    });
  } catch (err) {
    console.error('[priceAlerts] failed to process all-time-low alert', err);
  }
}
