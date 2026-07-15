import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './relativeTime';

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
