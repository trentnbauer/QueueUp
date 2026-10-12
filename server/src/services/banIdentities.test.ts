import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, createMany, deleteMany, count } = vi.hoisted(() => ({ findUnique: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { user: { findUnique }, bannedIdentity: { createMany, deleteMany, count } } }));

import { clearBannedIdentities, identitiesOf, matchesBannedIdentity, recordBannedIdentities } from './banIdentities.js';

const account = (over: Record<string, unknown> = {}) => ({
  oidcSub: 'discord:1',
  steamId64: '7656',
  email: ' Me@Example.com ',
  emailVerified: true,
  linkedIdentities: [{ oidcSub: 'google:9' }],
  ...over,
});

beforeEach(() => {
  findUnique.mockReset();
  createMany.mockReset();
  deleteMany.mockReset();
  count.mockReset();
});

describe('identitiesOf', () => {
  it('lists every provider id, the linked Steam account and a verified email, normalized', async () => {
    findUnique.mockResolvedValue(account());
    expect(await identitiesOf('u')).toEqual([
      { kind: 'sub', value: 'discord:1' },
      { kind: 'sub', value: 'steam:7656' },
      { kind: 'sub', value: 'google:9' },
      { kind: 'email', value: 'me@example.com' },
    ]);
  });

  it('never records an email the provider did not verify', async () => {
    findUnique.mockResolvedValue(account({ emailVerified: false }));
    expect((await identitiesOf('u')).some((k) => k.kind === 'email')).toBe(false);
  });
});

describe('recordBannedIdentities / clearBannedIdentities', () => {
  it('stores them against the banned account, skipping ones already there', async () => {
    findUnique.mockResolvedValue(account({ steamId64: null, linkedIdentities: [] }));
    await recordBannedIdentities('u1');
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { kind: 'sub', value: 'discord:1', bannedUserId: 'u1' },
        { kind: 'email', value: 'me@example.com', bannedUserId: 'u1' },
      ],
      skipDuplicates: true,
    });
  });

  it('forgets them on unban', async () => {
    await clearBannedIdentities('u1');
    expect(deleteMany).toHaveBeenCalledWith({ where: { bannedUserId: 'u1' } });
  });
});

describe('matchesBannedIdentity', () => {
  it('matches on the provider id, and on the email only when verified', async () => {
    count.mockResolvedValue(1);
    expect(await matchesBannedIdentity({ oidcSub: 'discord:2', email: 'Me@Example.com', emailVerified: true })).toBe(true);
    expect(count).toHaveBeenLastCalledWith({ where: { OR: [{ kind: 'sub', value: 'discord:2' }, { kind: 'email', value: 'me@example.com' }] } });
    await matchesBannedIdentity({ oidcSub: 'discord:2', email: 'me@example.com', emailVerified: false });
    expect(count).toHaveBeenLastCalledWith({ where: { OR: [{ kind: 'sub', value: 'discord:2' }] } });
  });

  it('is false when nothing matches', async () => {
    count.mockResolvedValue(0);
    expect(await matchesBannedIdentity({ oidcSub: 'x:1', email: 'a@b.c', emailVerified: true })).toBe(false);
  });
});
