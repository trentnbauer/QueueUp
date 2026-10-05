import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const findMany = vi.fn();
vi.mock('../db/client.js', () => ({ prisma: { notificationPreference: { findUnique, findMany } } }));

const { wantsAlert, hiddenInAppTypes } = await import('./notificationPreferences.js');

describe('wantsAlert', () => {
  beforeEach(() => findUnique.mockReset());

  it('defaults to yes when the person never set a preference', async () => {
    findUnique.mockResolvedValue(null);
    expect(await wantsAlert('u1', 'good_time_to_buy')).toBe(true);
  });

  it('is yes while either the bell or email is on', async () => {
    findUnique.mockResolvedValue({ inApp: true, email: false });
    expect(await wantsAlert('u1', 'feed_reaction')).toBe(true);
    // Bell off but email on: the row must still be written, or the email can never be sent.
    findUnique.mockResolvedValue({ inApp: false, email: true });
    expect(await wantsAlert('u1', 'feed_reaction')).toBe(true);
  });

  it('is no only when both are off', async () => {
    findUnique.mockResolvedValue({ inApp: false, email: false });
    expect(await wantsAlert('u1', 'feed_reaction')).toBe(false);
  });
});

describe('hiddenInAppTypes', () => {
  it('lists the types switched off in the bell', async () => {
    findMany.mockResolvedValue([{ type: 'feed_reaction' }, { type: 'good_time_to_buy' }]);
    expect(await hiddenInAppTypes('u1')).toEqual(['feed_reaction', 'good_time_to_buy']);
    expect(findMany).toHaveBeenCalledWith({ where: { userId: 'u1', inApp: false }, select: { type: true } });
  });
});
