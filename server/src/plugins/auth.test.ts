import { describe, it, expect } from 'vitest';
import { computeIsAdmin } from './auth.js';

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

  it('never grants admin to a synthetic Steam/Discord placeholder email, even if it matches the allowlist', () => {
    const opts = { devFakeAuth: false, adminEmails: '76561198000000000@steamcommunity.unknown' };
    expect(computeIsAdmin('76561198000000000@steamcommunity.unknown', opts)).toBe(false);
    expect(computeIsAdmin('123456789@discord.unknown', { devFakeAuth: false, adminEmails: '123456789@discord.unknown' })).toBe(
      false,
    );
  });
});
