import { describe, expect, it, vi } from 'vitest';

const { findFirst, findMany, upsert, deleteMany, transaction } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn((args: { create: unknown }) => ({ upsert: args })),
  deleteMany: vi.fn((args: { where: { OR: unknown } }) => ({ deleteMany: args })),
  transaction: vi.fn(async () => []),
}));
vi.mock('../db/client.js', () => ({
  prisma: { userBlock: { findFirst, findMany, upsert }, friendship: { deleteMany }, $transaction: transaction },
}));

import { blockedIdsOf, blockUser, isBlockedEitherWay } from './blocks.js';

describe('isBlockedEitherWay', () => {
  it('is false for the same person without asking the database', async () => {
    findFirst.mockClear();
    expect(await isBlockedEitherWay('a', 'a')).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('checks both directions', async () => {
    findFirst.mockResolvedValueOnce({ blockerId: 'b' });
    expect(await isBlockedEitherWay('a', 'b')).toBe(true);
    expect(findFirst.mock.calls.at(-1)?.[0].where.OR).toEqual([
      { blockerId: 'a', blockedId: 'b' },
      { blockerId: 'b', blockedId: 'a' },
    ]);
    findFirst.mockResolvedValueOnce(null);
    expect(await isBlockedEitherWay('a', 'b')).toBe(false);
  });
});

describe('blockUser', () => {
  it('records the block and ends any friendship or request between the two, in one transaction', async () => {
    await blockUser('a', 'b');
    expect(upsert.mock.calls.at(-1)?.[0].create).toEqual({ blockerId: 'a', blockedId: 'b' });
    expect(deleteMany.mock.calls.at(-1)?.[0].where.OR).toEqual([
      { requesterId: 'a', addresseeId: 'b' },
      { requesterId: 'b', addresseeId: 'a' },
    ]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('blockedIdsOf', () => {
  it('returns the other person in each block, whichever way it goes, without duplicates', async () => {
    findMany.mockResolvedValueOnce([
      { blockerId: 'a', blockedId: 'b' },
      { blockerId: 'c', blockedId: 'a' },
      { blockerId: 'b', blockedId: 'a' },
    ]);
    expect((await blockedIdsOf('a')).sort()).toEqual(['b', 'c']);
    expect(findMany.mock.calls.at(-1)?.[0].where.OR).toEqual([{ blockerId: 'a' }, { blockedId: 'a' }]);
  });

  it('is empty when there are no blocks', async () => {
    findMany.mockResolvedValueOnce([]);
    expect(await blockedIdsOf('a')).toEqual([]);
  });
});
