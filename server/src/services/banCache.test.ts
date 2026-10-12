import { describe, expect, it, vi } from 'vitest';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { user: { findUnique } } }));

import { BannedError, forgetBan, isBanned } from './banCache.js';

describe('isBanned', () => {
  it('reads the ban from the database and remembers it briefly', async () => {
    findUnique.mockResolvedValueOnce({ bannedAt: new Date() });
    expect(await isBanned('u1')).toBe(true);
    expect(await isBanned('u1')).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('sees an unban straight away once the ban is forgotten', async () => {
    findUnique.mockResolvedValueOnce({ bannedAt: new Date() });
    expect(await isBanned('u2')).toBe(true);
    forgetBan('u2');
    findUnique.mockResolvedValueOnce({ bannedAt: null });
    expect(await isBanned('u2')).toBe(false);
  });

  it('treats a missing account as not banned', async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await isBanned('gone')).toBe(false);
  });
});

describe('BannedError', () => {
  it('is a 403 the app can recognise by its code', () => {
    const err = new BannedError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('banned');
  });
});
