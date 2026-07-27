import { describe, it, expect } from 'vitest';
import { formatCountdown, formatRelativeTime } from './relativeTime';

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-15T12:00:00.000Z').getTime();

  it('reads "just now" for under a minute', () => {
    expect(formatRelativeTime(new Date(now - 10_000).toISOString(), now)).toBe('just now');
  });

  it('formats minutes', () => {
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m ago');
  });

  it('formats hours', () => {
    expect(formatRelativeTime(new Date(now - 3 * 60 * 60_000).toISOString(), now)).toBe('3h ago');
  });

  it('formats days', () => {
    expect(formatRelativeTime(new Date(now - 2 * 24 * 60 * 60_000).toISOString(), now)).toBe('2d ago');
  });

  it('formats months', () => {
    expect(formatRelativeTime(new Date(now - 60 * 24 * 60 * 60_000).toISOString(), now)).toBe('2mo ago');
  });

  it('formats years', () => {
    expect(formatRelativeTime(new Date(now - 400 * 24 * 60 * 60_000).toISOString(), now)).toBe('1y ago');
  });

  it('returns empty string for an invalid date', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('');
  });
});

describe('formatCountdown', () => {
  const now = new Date('2026-07-15T12:00:00.000Z').getTime();

  it('reads "Out now" for a release already at or past now (issue #367)', () => {
    expect(formatCountdown(new Date(now - 1000).toISOString(), now)).toBe('Out now');
    expect(formatCountdown(new Date(now).toISOString(), now)).toBe('Out now');
  });

  it('reads "Tomorrow" for exactly one day out', () => {
    expect(formatCountdown(new Date(now + 24 * 60 * 60_000).toISOString(), now)).toBe('Tomorrow');
  });

  it('formats under two weeks in days', () => {
    expect(formatCountdown(new Date(now + 5 * 24 * 60 * 60_000).toISOString(), now)).toBe('In 5d');
  });

  it('formats under two months in weeks', () => {
    expect(formatCountdown(new Date(now + 21 * 24 * 60 * 60_000).toISOString(), now)).toBe('In 3w');
  });

  it('formats under a year in months', () => {
    expect(formatCountdown(new Date(now + 90 * 24 * 60 * 60_000).toISOString(), now)).toBe('In 3mo');
  });

  it('formats a year or more in years', () => {
    expect(formatCountdown(new Date(now + 400 * 24 * 60 * 60_000).toISOString(), now)).toBe('In 1y');
  });

  it('returns empty string for an invalid date', () => {
    expect(formatCountdown('not-a-date', now)).toBe('');
  });
});
