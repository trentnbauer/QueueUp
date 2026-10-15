import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { game: { updateMany: h.updateMany } } }));
vi.mock('./badges.js', () => ({ unlockBadges: vi.fn() }));

import { promoteOwnedWishlistGames, promoteReleasedPreorders } from './gameOwnership.js';

beforeEach(() => vi.clearAllMocks());

describe('promoteOwnedWishlistGames', () => {
  it('moves a bought wishlist game to backlog when released and to preordered when not', async () => {
    h.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
    expect(await promoteOwnedWishlistGames('u1', [7, 7, 8])).toBe(3);
    const [released, upcoming] = h.updateMany.mock.calls.map((c) => c[0]);
    // Bought: it is stamped so the Backlog can pin it as recently bought.
    expect(released.data).toEqual({ status: 'backlog', purchasedAt: expect.any(Date) });
    expect(released.where.OR).toBeDefined();
    expect(released.where.igdbId).toEqual({ in: [7, 8] });
    expect(upcoming.data).toEqual({ status: 'preordered' });
    expect(upcoming.where.status).toBe('wishlist');
    expect(upcoming.where.OR).toBeUndefined();
  });

  it('does nothing for an empty list', async () => {
    expect(await promoteOwnedWishlistGames('u1', [])).toBe(0);
    expect(h.updateMany).not.toHaveBeenCalled();
  });
});

describe('promoteReleasedPreorders', () => {
  it('moves released preorders to backlog', async () => {
    h.updateMany.mockResolvedValueOnce({ count: 4 });
    const now = new Date();
    expect(await promoteReleasedPreorders(now)).toBe(4);
    expect(h.updateMany.mock.calls[0][0]).toEqual({
      where: { roomId: null, status: 'preordered', releaseDate: { lte: now } },
      data: { status: 'backlog', purchasedAt: now },
    });
  });
});
