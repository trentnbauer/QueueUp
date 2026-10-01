import { describe, it, expect } from 'vitest';
import { computeIsAdmin, primaryProviderOf } from './auth.js';

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
