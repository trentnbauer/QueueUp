import type { GamePrice } from '@squadqueue/shared';
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
