import { describe, it, expect } from 'vitest';
import { blockedWhileViewingAs, computeIsAdmin, primaryProviderOf } from './auth.js';
import { viewAsRefusal } from '../services/adminAccess.js';

describe('computeIsAdmin', () => {
  it('grants admin to everyone when DEV_FAKE_AUTH is on', () => {
    expect(computeIsAdmin('anyone@example.com', { devFakeAuth: true, adminEmails: '' })).toBe(true);
  });

  it('grants admin to an email on the allowlist', () => {
    const opts = { devFakeAuth: false, adminEmails: 'admin@example.com, other@example.com' };
    expect(computeIsAdmin('admin@example.com', opts)).toBe(true);
    expect(computeIsAdmin('ADMIN@EXAMPLE.COM', opts)).toBe(true);
  });

  it('denies an email not on the allowlist', () => {
    expect(computeIsAdmin('nobody@example.com', { devFakeAuth: false, adminEmails: 'admin@example.com' })).toBe(false);
  });

  it('never grants admin through an email the sign-in provider has not verified', () => {
    const opts = { devFakeAuth: false, adminEmails: 'admin@example.com' };
    expect(computeIsAdmin('admin@example.com', { ...opts, emailVerified: false })).toBe(false);
    expect(computeIsAdmin('admin@example.com', { ...opts, emailVerified: true })).toBe(true);
  });

  it('never grants admin to a synthetic Steam/Discord placeholder email, even if it matches the allowlist', () => {
    const opts = { devFakeAuth: false, adminEmails: '76561198000000000@steamcommunity.unknown' };
    expect(computeIsAdmin('76561198000000000@steamcommunity.unknown', opts)).toBe(false);
    expect(computeIsAdmin('123456789@discord.unknown', { devFakeAuth: false, adminEmails: '123456789@discord.unknown' })).toBe(
      false,
    );
    expect(computeIsAdmin('2535400000000001@xbox.unknown', { devFakeAuth: false, adminEmails: '2535400000000001@xbox.unknown', emailVerified: true })).toBe(
      false,
    );
  });
});

describe('primaryProviderOf', () => {
  it('reads the provider prefix off an oidcSub', () => {
    expect(primaryProviderOf('discord:123456789')).toBe('discord');
    expect(primaryProviderOf('google:abc')).toBe('google');
    expect(primaryProviderOf('steam:76561198000000000')).toBe('steam');
    expect(primaryProviderOf('oidc:some-sub')).toBe('oidc');
  });
});

describe('view as user (#1102)', () => {
  it('lets reads through and refuses every change, except the routes that opt in', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS', 'get']) expect(blockedWhileViewingAs(m, undefined)).toBe(false);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(blockedWhileViewingAs(m, undefined)).toBe(true);
    expect(blockedWhileViewingAs('DELETE', true)).toBe(false);
    expect(blockedWhileViewingAs('POST', false)).toBe(true);
  });

  it('keeps Super administrators out of reach of plain Administrators', () => {
    const admin = { id: 'a', isSuperAdmin: false };
    const owner = { id: 'o', isSuperAdmin: true };
    const person = { id: 'p', isSuperAdmin: false };
    expect(viewAsRefusal(admin, person)).toBeNull();
    expect(viewAsRefusal(admin, owner)).toMatch(/Super administrator/);
    expect(viewAsRefusal(owner, { id: 'o2', isSuperAdmin: true })).toBeNull();
    expect(viewAsRefusal(admin, admin)).toBe('That is you');
  });
});
