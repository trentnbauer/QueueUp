import { beforeEach, describe, expect, it, vi } from 'vitest';

const limit = { value: 3 };
const access = { value: 'everyone' };
vi.mock('../../config/env.js', () => ({
  env: {
    get AI_SERVER_DAILY_LIMIT() {
      return limit.value;
    },
    get AI_SERVER_ACCESS() {
      return access.value;
    },
  },
}));
const findUnique = vi.fn();
vi.mock('../../db/client.js', () => ({ prisma: { user: { findUnique } } }));
const incr = vi.fn();
const expire = vi.fn(async () => 1);
const decr = vi.fn(async () => 0);
vi.mock('../redisClient.js', () => ({ redis: { incr, expire, decr } }));

const { chargeServerAiUse } = await import('./aiQuota.js');

describe('chargeServerAiUse', () => {
  beforeEach(() => {
    limit.value = 3;
    access.value = 'everyone';
    for (const m of [findUnique, incr, expire, decr]) m.mockClear();
    findUnique.mockResolvedValue({ isAdmin: false, aiEntitled: false });
    incr.mockResolvedValue(1);
  });

  it('counts a use and sets the counter to expire on its first use of the day', async () => {
    await chargeServerAiUse('u1');
    expect(incr).toHaveBeenCalledWith(expect.stringMatching(/^ai:server-use:u1:\d{4}-\d{2}-\d{2}$/));
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('allows up to the limit and refuses the next with a 429, without keeping the refused use', async () => {
    incr.mockResolvedValue(3);
    await expect(chargeServerAiUse('u1')).resolves.toBeDefined();
    incr.mockResolvedValue(4);
    await expect(chargeServerAiUse('u1')).rejects.toMatchObject({ statusCode: 429 });
    expect(decr).toHaveBeenCalledTimes(1);
  });

  describe('when only entitled accounts may use the server AI', () => {
    beforeEach(() => {
      access.value = 'entitled';
    });

    it('refuses an account that has not been switched on, without counting it', async () => {
      await expect(chargeServerAiUse('u1')).rejects.toMatchObject({ statusCode: 403 });
      expect(incr).not.toHaveBeenCalled();
    });

    it('refuses an unentitled account even when the daily limit is 0', async () => {
      limit.value = 0;
      await expect(chargeServerAiUse('u1')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('lets an entitled account through, still counting against the daily limit', async () => {
      findUnique.mockResolvedValue({ isAdmin: false, aiEntitled: true });
      await chargeServerAiUse('u1');
      expect(incr).toHaveBeenCalledTimes(1);
    });

    it('lets an entitled account through uncounted when the limit is 0', async () => {
      limit.value = 0;
      findUnique.mockResolvedValue({ isAdmin: false, aiEntitled: true });
      await chargeServerAiUse('u1');
      expect(incr).not.toHaveBeenCalled();
    });

    it('lets administrators through', async () => {
      findUnique.mockResolvedValue({ isAdmin: true, aiEntitled: false });
      await chargeServerAiUse('admin');
    });
  });

  it('gives a use back when asked (the provider failed)', async () => {
    const charge = await chargeServerAiUse('u1');
    await charge.refund();
    expect(decr).toHaveBeenCalledTimes(1);
  });

  it('does not count administrators or a limit of 0', async () => {
    findUnique.mockResolvedValue({ isAdmin: true });
    await chargeServerAiUse('admin');
    limit.value = 0;
    findUnique.mockResolvedValue({ isAdmin: false });
    await chargeServerAiUse('u1');
    expect(incr).not.toHaveBeenCalled();
  });

  it('lets the call through if Redis is unreachable', async () => {
    incr.mockRejectedValue(new Error('down'));
    await expect(chargeServerAiUse('u1')).resolves.toBeDefined();
  });
});
