import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ownership: vi.fn(), members: vi.fn(), rooms: vi.fn(), games: vi.fn() }));
vi.mock('../db/client.js', () => ({
  prisma: {
    gameOwnership: { findMany: h.ownership },
    roomMember: { findMany: h.members },
    room: { findMany: h.rooms },
    game: { findMany: h.games },
  },
}));
vi.mock('./badges.js', () => ({ unlockBadges: vi.fn() }));

import { getOwnershipInfo, purchasedAtOnArrival } from './gameOwnership.js';
import type { GameWithRelations } from './gameSerializer.js';

const roomGame = { id: 'g1', igdbId: 7, roomId: 'r1', status: 'backlog' } as unknown as GameWithRelations;

beforeEach(() => {
  vi.clearAllMocks();
  h.ownership.mockResolvedValue([
    { igdbId: 7, userId: 'me', platforms: ['pc'] },
    { igdbId: 7, userId: 'friend', platforms: ['pc'] },
  ]);
  h.members.mockResolvedValue([
    { roomId: 'r1', userId: 'me' },
    { roomId: 'r1', userId: 'friend' },
  ]);
  h.rooms.mockResolvedValue([{ id: 'r1', platform: 'pc' }]);
});

describe('getOwnershipInfo for a room game', () => {
  it('counts a member who owns it on the room platform', async () => {
    h.games.mockResolvedValue([]);
    const info = (await getOwnershipInfo([roomGame], 'me')).get('g1')!;
    expect(info.youOwn).toBe(true);
    expect(info.ownerIds).toEqual(['me', 'friend']);
  });

  it("does not count a member whose own Personal Shelf has it on the Wishlist, despite a stale ownership row", async () => {
    h.games.mockResolvedValue([{ igdbId: 7, addedBy: 'me' }]);
    const info = (await getOwnershipInfo([roomGame], 'me')).get('g1')!;
    expect(info.youOwn).toBe(false);
    expect(info.ownerIds).toEqual(['friend']);
    expect(info.ownership).toEqual({ owned: 1, total: 2 });
  });
});

describe('purchasedAtOnArrival', () => {
  const now = new Date('2026-01-02T03:04:05Z');

  it('stamps a Personal Shelf game that arrives in the Backlog, so it shows at the top as new', () => {
    expect(purchasedAtOnArrival('backlog', null, now)).toEqual(now);
  });

  it('stamps nothing for any other status, or for a room game, which is not "bought"', () => {
    for (const status of ['wishlist', 'preordered', 'playing', 'play_next', 'done']) expect(purchasedAtOnArrival(status, null, now)).toBeNull();
    expect(purchasedAtOnArrival('backlog', 'room-1', now)).toBeNull();
  });
});
