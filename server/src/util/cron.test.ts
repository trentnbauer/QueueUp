import { describe, it, expect } from 'vitest';
import { parseCron, isValidCron, cronMatches, nextCronRun } from './cron.js';

const at = (iso: string) => new Date(iso); // local time, no Z

describe('parseCron', () => {
  it('rejects malformed schedules', () => {
    for (const bad of ['', '* * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '*/0 * * * *', 'a b c d e', '5-1 * * * *', '1,,2 * * * *']) {
      expect(isValidCron(bad)).toBe(false);
    }
  });

  it('accepts lists, ranges, steps and 7 as Sunday', () => {
    expect(isValidCron('0 3 * * *')).toBe(true);
    expect(isValidCron('*/15 0-6 1,15 * 1-5')).toBe(true);
    expect([...parseCron('0 0 * * 7').daysOfWeek]).toEqual([0]);
    expect([...parseCron('*/20 * * * *').minutes]).toEqual([0, 20, 40]);
    expect([...parseCron('5/20 * * * *').minutes]).toEqual([5, 25, 45]);
  });
});

describe('cronMatches / nextCronRun', () => {
  it('matches the nightly default at 03:00 only', () => {
    const s = parseCron('0 3 * * *');
    expect(cronMatches(s, at('2026-10-01T03:00:30'))).toBe(true);
    expect(cronMatches(s, at('2026-10-01T03:01:00'))).toBe(false);
    expect(cronMatches(s, at('2026-10-01T04:00:00'))).toBe(false);
  });

  it('finds the next run, rolling over day/month/year', () => {
    const s = parseCron('0 3 * * *');
    expect(nextCronRun(s, at('2026-10-01T02:59:00'))).toEqual(at('2026-10-01T03:00:00'));
    expect(nextCronRun(s, at('2026-10-01T03:00:00'))).toEqual(at('2026-10-02T03:00:00'));
    expect(nextCronRun(s, at('2026-12-31T05:00:00'))).toEqual(at('2027-01-01T03:00:00'));
  });

  it('uses OR when both day-of-month and day-of-week are restricted', () => {
    const s = parseCron('0 0 13 * 5'); // the 13th, or any Friday
    expect(cronMatches(s, at('2026-10-02T00:00:00'))).toBe(true); // a Friday
    expect(cronMatches(s, at('2026-10-13T00:00:00'))).toBe(true); // the 13th (a Tuesday)
    expect(cronMatches(s, at('2026-10-14T00:00:00'))).toBe(false);
  });

  it('returns null for a schedule that never fires', () => {
    expect(nextCronRun(parseCron('0 0 31 2 *'), at('2026-01-01T00:00:00'))).toBeNull();
  });
});
