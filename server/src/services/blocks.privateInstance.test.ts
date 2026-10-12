import { describe, it, expect, vi } from 'vitest';

const findFirst = vi.fn();
const findMany = vi.fn();
const transaction = vi.fn();
vi.mock('../db/client.js', () => ({ prisma: { userBlock: { findFirst, findMany }, $transaction: transaction } }));
vi.mock('../config/env.js', () => ({ env: { PRIVATE_INSTANCE: true } }));

const { blockUser, blockedIdsOf, isBlockedEitherWay } = await import('./blocks.js');

describe('blocking on a private instance', () => {
  it('ignores blocks made before the setting was switched on', async () => {
    findFirst.mockResolvedValue({ blockerId: 'a' });
    findMany.mockResolvedValue([{ blockerId: 'a', blockedId: 'b' }]);
    expect(await isBlockedEitherWay('a', 'b')).toBe(false);
    expect(await blockedIdsOf('a')).toEqual([]);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('does not record new blocks', async () => {
    await blockUser('a', 'b');
    expect(transaction).not.toHaveBeenCalled();
  });
});
