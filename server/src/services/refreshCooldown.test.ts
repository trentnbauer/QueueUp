import { describe, it, expect } from 'vitest';
import { FORCED_REFRESH_COOLDOWN_MS, cooldownRemainingMs, formatCooldownMessage } from './refreshCooldown.js';

describe('cooldownRemainingMs', () => {
  it('returns the full cooldown when the last forced refresh was just now', () => {
    const now = 1_000_000;
    expect(cooldownRemainingMs(now, now)).toBe(FORCED_REFRESH_COOLDOWN_MS);
  });

  it('returns a smaller positive number as time passes within the window', () => {
    const now = 1_000_000;
    const lastForcedAt = now - 30 * 60 * 1000; // 30 minutes ago
    expect(cooldownRemainingMs(lastForcedAt, now)).toBe(30 * 60 * 1000);
  });

  it('returns zero exactly at the cooldown boundary', () => {
    const now = 1_000_000;
    const lastForcedAt = now - FORCED_REFRESH_COOLDOWN_MS;
    expect(cooldownRemainingMs(lastForcedAt, now)).toBe(0);
  });

  it('returns a negative number once the cooldown has fully elapsed', () => {
    const now = 1_000_000;
    const lastForcedAt = now - FORCED_REFRESH_COOLDOWN_MS - 60_000;
    expect(cooldownRemainingMs(lastForcedAt, now)).toBeLessThan(0);
  });
});

describe('formatCooldownMessage', () => {
  it('rounds up to the nearest minute', () => {
    expect(formatCooldownMessage(61_000)).toBe('Price was already refreshed recently — try again in 2 minutes.');
  });

  it('never reads "in 0 minutes" even for a tiny remainder', () => {
    expect(formatCooldownMessage(500)).toBe('Price was already refreshed recently — try again in 1 minute.');
  });

  it('uses singular "minute" only for exactly one minute', () => {
    expect(formatCooldownMessage(60_000)).toBe('Price was already refreshed recently — try again in 1 minute.');
  });

  it('formats a near-hour remainder correctly', () => {
    expect(formatCooldownMessage(42 * 60 * 1000)).toBe('Price was already refreshed recently — try again in 42 minutes.');
  });
});
