import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  roomFindUnique: vi.fn(),
  siteFindUnique: vi.fn(),
  siteUpdateMany: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  prisma: {
    room: { findUnique: mocks.roomFindUnique },
    siteInvite: { findUnique: mocks.siteFindUnique, updateMany: mocks.siteUpdateMany },
  },
}));
vi.mock('./notifications.js', () => ({ notifyRoom: vi.fn() }));

import { consumeInvite, generateSiteInviteCode, isSiteInviteUsable, resolveInvite } from './signupInvites.js';

const base = { maxUses: null as number | null, uses: 0, expiresAt: null as Date | null, revokedAt: null as Date | null };

describe('isSiteInviteUsable', () => {
  it('accepts an open-ended invite', () => {
    expect(isSiteInviteUsable(base)).toBe(true);
  });
  it('refuses revoked, expired and used-up invites', () => {
    expect(isSiteInviteUsable({ ...base, revokedAt: new Date() })).toBe(false);
    expect(isSiteInviteUsable({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe(false);
    expect(isSiteInviteUsable({ ...base, maxUses: 1, uses: 1 })).toBe(false);
    expect(isSiteInviteUsable({ ...base, maxUses: 2, uses: 1 })).toBe(true);
  });
});

describe('resolveInvite', () => {
  beforeEach(() => vi.resetAllMocks());

  it('accepts a live room invite code', async () => {
    mocks.roomFindUnique.mockResolvedValue({ id: 'r1', deletedAt: null });
    expect(await resolveInvite(' ABC ')).toEqual({ kind: 'room', roomId: 'r1' });
    expect(mocks.roomFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { inviteCode: 'ABC' } }));
  });
  it('refuses a deleted room and falls back to site invites', async () => {
    mocks.roomFindUnique.mockResolvedValue({ id: 'r1', deletedAt: new Date() });
    mocks.siteFindUnique.mockResolvedValue({ id: 's1', code: 'X', ...base });
    expect(await resolveInvite('X')).toEqual({ kind: 'site', id: 's1' });
  });
  it('returns null for unknown, revoked or non-string codes', async () => {
    mocks.roomFindUnique.mockResolvedValue(null);
    mocks.siteFindUnique.mockResolvedValue({ id: 's1', code: 'X', ...base, revokedAt: new Date() });
    expect(await resolveInvite('X')).toBeNull();
    expect(await resolveInvite(42)).toBeNull();
    expect(await resolveInvite('   ')).toBeNull();
  });
});

describe('consumeInvite', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does not use up a room invite', async () => {
    expect(await consumeInvite({ kind: 'room', roomId: 'r1' })).toBe(true);
    expect(mocks.siteUpdateMany).not.toHaveBeenCalled();
  });
  it('uses up a site invite once', async () => {
    mocks.siteFindUnique.mockResolvedValue({ id: 's1', ...base, maxUses: 1 });
    mocks.siteUpdateMany.mockResolvedValue({ count: 1 });
    expect(await consumeInvite({ kind: 'site', id: 's1' })).toBe(true);
  });
  it('refuses a site invite that is already used up', async () => {
    mocks.siteFindUnique.mockResolvedValue({ id: 's1', ...base, maxUses: 1, uses: 1 });
    expect(await consumeInvite({ kind: 'site', id: 's1' })).toBe(false);
    expect(mocks.siteUpdateMany).not.toHaveBeenCalled();
  });
});

describe('generateSiteInviteCode', () => {
  it('makes distinct unambiguous codes', () => {
    const a = generateSiteInviteCode();
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    expect(generateSiteInviteCode()).not.toBe(a);
  });
});
