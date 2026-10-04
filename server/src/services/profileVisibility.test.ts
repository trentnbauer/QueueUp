import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
vi.mock('../db/client.js', () => ({ prisma: { friendship: { findFirst }, user: { count: vi.fn() } } }));
vi.mock('../config/env.js', () => ({ env: { PRIVATE_INSTANCE: false } }));

const { canViewProfile } = await import('./friendships.js');

const owner = (profileVisibility: 'public' | 'friends' | 'private') => ({ id: 'owner', profileVisibility });

describe('canViewProfile', () => {
  beforeEach(() => findFirst.mockReset());

  it('always lets the owner see their own profile', async () => {
    expect(await canViewProfile('owner', owner('private'))).toBe(true);
  });

  it('shows a public profile to anyone, signed in or not', async () => {
    expect(await canViewProfile(null, owner('public'))).toBe(true);
    expect(await canViewProfile('stranger', owner('public'))).toBe(true);
  });

  it('shows a friends-only profile to friends only', async () => {
    findFirst.mockResolvedValueOnce({ id: 'f1' });
    expect(await canViewProfile('friend', owner('friends'))).toBe(true);
    findFirst.mockResolvedValueOnce(null);
    expect(await canViewProfile('stranger', owner('friends'))).toBe(false);
    expect(await canViewProfile(null, owner('friends'))).toBe(false);
  });

  it('hides a private profile from everyone else, friends included', async () => {
    findFirst.mockResolvedValue({ id: 'f1' });
    expect(await canViewProfile('friend', owner('private'))).toBe(false);
    expect(await canViewProfile(null, owner('private'))).toBe(false);
  });
});
