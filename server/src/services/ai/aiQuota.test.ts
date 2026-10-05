import { beforeEach, describe, expect, it, vi } from 'vitest';

const limit = { value: 3 };
vi.mock('../../config/env.js', () => ({
  env: {
    get AI_SERVER_DAILY_LIMIT() {
      return limit.value;
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
    for (const m of [findUnique, incr, expire, decr]) m.mockClear();
    findUnique.mockResolvedValue({ isAdmin: false });
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
