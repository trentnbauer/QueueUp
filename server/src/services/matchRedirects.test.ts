import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateMany, deleteMany, upsert, findUnique, findMany, $transaction } = vi.hoisted(() => ({
  updateMany: vi.fn((args: unknown) => args),
  deleteMany: vi.fn((args: unknown) => args),
  upsert: vi.fn((args: unknown) => args),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock('../db/client.js', () => ({
  prisma: { gameMatchRedirect: { updateMany, deleteMany, upsert, findUnique, findMany }, $transaction },
}));

import { applyMatchRedirect, deleteMatchRedirect, listMatchRedirects, recordMatchRedirect } from './matchRedirects.js';

const witcher3 = { igdbId: 1, title: 'The Witcher 3: Wild Hunt', coverImageUrl: 'c.jpg' };
const remaster = { igdbId: 2, title: 'The Witcher 3: Wild Hunt - Complete Edition' };

beforeEach(() => vi.clearAllMocks());

describe('applyMatchRedirect', () => {
  it('returns the game the person merged it into', async () => {
    findUnique.mockResolvedValueOnce({ toIgdbId: 2 });
    expect(await applyMatchRedirect('u', 1)).toBe(2);
    expect(findUnique).toHaveBeenCalledWith({ where: { userId_fromIgdbId: { userId: 'u', fromIgdbId: 1 } }, select: { toIgdbId: true } });
  });

  it('returns the id unchanged when there is no redirect', async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await applyMatchRedirect('u', 7)).toBe(7);
  });
});

describe('recordMatchRedirect', () => {
  it('stores the redirect with titles, re-pointing earlier ones and clearing a loop back', async () => {
    await recordMatchRedirect('u', witcher3, remaster);
    const ops = $transaction.mock.calls[0][0] as { where?: unknown; data?: unknown; create?: unknown }[];
    expect(ops[0]).toEqual({ where: { userId: 'u', toIgdbId: 1 }, data: { toIgdbId: 2, toTitle: remaster.title } });
    expect(ops[1]).toEqual({ where: { userId: 'u', fromIgdbId: 2 } });
    expect(ops[2].create).toEqual({
      userId: 'u',
      fromIgdbId: 1,
      fromTitle: witcher3.title,
      fromCoverImageUrl: 'c.jpg',
      toIgdbId: 2,
      toTitle: remaster.title,
    });
  });

  it('does nothing when both ids are the same game', async () => {
    await recordMatchRedirect('u', witcher3, { igdbId: 1, title: witcher3.title });
    expect($transaction).not.toHaveBeenCalled();
  });
});

describe('merged list', () => {
  it('lists newest first for one person', async () => {
    findMany.mockResolvedValueOnce([]);
    await listMatchRedirects('u');
    expect(findMany).toHaveBeenCalledWith({ where: { userId: 'u' }, orderBy: { createdAt: 'desc' } });
  });

  it('stops redirecting only that person\'s old game', async () => {
    await deleteMatchRedirect('u', 1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'u', fromIgdbId: 1 } });
  });
});
