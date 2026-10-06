import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, createMany } = vi.hoisted(() => ({ findMany: vi.fn(), createMany: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { hiddenRecommendation: { findMany, createMany } } }));

import { getHiddenIgdbIds, hideRecommendation } from './hiddenRecommendations.js';

beforeEach(() => vi.clearAllMocks());

describe('hidden recommendations', () => {
  it('reads the person\'s hidden games as a set of igdb ids', async () => {
    findMany.mockResolvedValue([{ igdbId: 5 }, { igdbId: 9 }]);
    expect(await getHiddenIgdbIds('u1')).toEqual(new Set([5, 9]));
    expect(findMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, select: { igdbId: true } });
  });

  it('hides a game once, however many times it is asked', async () => {
    await hideRecommendation('u1', 5);
    expect(createMany).toHaveBeenCalledWith({ data: [{ userId: 'u1', igdbId: 5 }], skipDuplicates: true });
  });
});
