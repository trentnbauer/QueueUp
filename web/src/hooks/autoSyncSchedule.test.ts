import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS_MIN_INTERVAL_MS, LIBRARIES_MIN_INTERVAL_MS, autoSyncDue } from './autoSyncSchedule';

describe('autoSyncDue', () => {
  const now = 1_000_000_000_000;

  it('is due when it never ran', () => {
    expect(autoSyncDue(now, 0, LIBRARIES_MIN_INTERVAL_MS)).toBe(true);
  });

  it('is not due until the interval has passed', () => {
    expect(autoSyncDue(now, now - 59 * 60 * 1000, LIBRARIES_MIN_INTERVAL_MS)).toBe(false);
    expect(autoSyncDue(now, now - LIBRARIES_MIN_INTERVAL_MS, LIBRARIES_MIN_INTERVAL_MS)).toBe(true);
  });

  it('checks achievements less often than libraries', () => {
    expect(ACHIEVEMENTS_MIN_INTERVAL_MS).toBeGreaterThan(LIBRARIES_MIN_INTERVAL_MS);
    expect(autoSyncDue(now, now - 2 * LIBRARIES_MIN_INTERVAL_MS, ACHIEVEMENTS_MIN_INTERVAL_MS)).toBe(false);
  });

  it('treats a last run in the future (clock change) as due', () => {
    expect(autoSyncDue(now, now + 5 * 60 * 60 * 1000, LIBRARIES_MIN_INTERVAL_MS)).toBe(true);
  });
});
