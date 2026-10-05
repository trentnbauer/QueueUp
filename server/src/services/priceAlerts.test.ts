import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GamePrice } from '@queueup/shared';

const updateMany = vi.fn(async () => ({ count: 1 }));
vi.mock('../db/client.js', () => ({ prisma: { game: { updateMany }, room: { findUnique: async () => null } } }));
const notifyPriceDrop = vi.fn(async () => {});
const notifyGoodTimeToBuy = vi.fn(async () => {});
vi.mock('./notifications.js', () => ({ notifyPriceDrop, notifyGoodTimeToBuy }));
vi.mock('./gameOwnership.js', () => ({ isOwnedBy: async () => false }));
vi.mock('./badges.js', () => ({ unlockBadges: async () => [] }));
vi.mock('./notificationPreferences.js', () => ({ isInAppEnabled: async () => true }));
vi.mock('./priceHistory.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./priceHistory.js')>()),
  getPriceHistory: async () => [],
}));

const { runPriceAlertChecks } = await import('./priceAlerts.js');

const game = {
  id: 'g1',
  title: 'Gears of War: E-Day',
  addedBy: 'u1',
  roomId: null,
  igdbId: 1,
  status: 'wishlist',
  steamAppid: 10,
  targetPrice: null,
  notifiedAtlPrice: null,
  notifiedGoodTimePrice: null,
} as unknown as Parameters<typeof runPriceAlertChecks>[0];

const price = (amount: string, historicalLow: string): GamePrice => ({
  amount,
  currency: 'AUD',
  source: 'live',
  historicalLow,
  lastRefreshedAt: new Date().toISOString(),
});

describe('runPriceAlertChecks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends only the all-time-low alert when a price hits a new low', async () => {
    await runPriceAlertChecks(game, price('78.59', '78.59'));
    expect(notifyPriceDrop).toHaveBeenCalledTimes(1);
    expect(notifyGoodTimeToBuy).not.toHaveBeenCalled();
    // The good-time price is still recorded, so the same dip doesn't alert on its own next run.
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { notifiedGoodTimePrice: '78.59' } }));
  });

  it('sends "good time to buy" when nothing else fired for that price', async () => {
    // Near (within 5% of) the all-time low but not at or below it, so no new-low alert.
    await runPriceAlertChecks(game, price('80.00', '78.00'));
    expect(notifyPriceDrop).not.toHaveBeenCalled();
    expect(notifyGoodTimeToBuy).toHaveBeenCalledTimes(1);
  });

  it.each(['done', 'dropped', 'wont_play', 'replay', 'playing', 'paused'])('sends no all-time-low alert for a %s game', async (status) => {
    await runPriceAlertChecks({ ...game, status } as typeof game, price('78.59', '78.59'));
    expect(notifyPriceDrop).not.toHaveBeenCalled();
  });

  it.each(['backlog', 'play_next'])('still sends the all-time-low alert for a %s game', async (status) => {
    await runPriceAlertChecks({ ...game, status } as typeof game, price('78.59', '78.59'));
    expect(notifyPriceDrop).toHaveBeenCalledTimes(1);
  });

  it('ignores a few cents of jitter under the price it last alerted at', async () => {
    await runPriceAlertChecks({ ...game, notifiedGoodTimePrice: '80.00' } as typeof game, price('79.80', '78.00'));
    expect(notifyGoodTimeToBuy).not.toHaveBeenCalled();
  });
});
