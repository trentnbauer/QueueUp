import { describe, it, expect } from 'vitest';
import { summarizeTimeToBeat, summarizeActiveHoursToBeat, pickMostNeglectedGame, bucketBacklogAge } from './backlogInsights.js';
import type { BacklogInsightGameRow } from './backlogInsights.js';

function game(overrides: Partial<BacklogInsightGameRow> & { id: string }): BacklogInsightGameRow {
  return {
    title: overrides.id,
    coverImageUrl: null,
    status: 'backlog',
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
    updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    votes: [],
    ...overrides,
  };
}

describe('summarizeTimeToBeat', () => {
  it('is null/0 with no entries', () => {
    expect(summarizeTimeToBeat([])).toEqual({ averageDaysToBeat: null, finishedEntryCount: 0 });
  });

  it('averages calendar days across entries', () => {
    const result = summarizeTimeToBeat([
      { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-05T00:00:00.000Z') }, // 4 days
      { startedAt: new Date('2026-02-01T00:00:00.000Z'), finishedAt: new Date('2026-02-11T00:00:00.000Z') }, // 10 days
    ]);
    expect(result).toEqual({ averageDaysToBeat: 7, finishedEntryCount: 2 });
  });

  it('rounds to one decimal place', () => {
    const result = summarizeTimeToBeat([
      { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-02T12:00:00.000Z') }, // 1.5 days
      { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-02T00:00:00.000Z') }, // 1 day
    ]);
    expect(result).toEqual({ averageDaysToBeat: 1.3, finishedEntryCount: 2 });
  });

  it('excludes zero-duration entries (jumped straight to Done/Dropped, see recordStatusTransition) rather than dragging the average toward zero', () => {
    const zeroDuration = { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-01T00:00:00.000Z') };
    const real = { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-11T00:00:00.000Z') }; // 10 days
    expect(summarizeTimeToBeat([zeroDuration, real])).toEqual({ averageDaysToBeat: 10, finishedEntryCount: 1 });
  });

  it('is null/0 when every entry is zero-duration', () => {
    const zeroDuration = { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-01T00:00:00.000Z') };
    expect(summarizeTimeToBeat([zeroDuration])).toEqual({ averageDaysToBeat: null, finishedEntryCount: 0 });
  });
});

describe('summarizeActiveHoursToBeat', () => {
  it('is null/0 with no entries', () => {
    expect(summarizeActiveHoursToBeat([])).toEqual({ averageHoursToBeat: null, hoursTrackedEntryCount: 0 });
  });

  it('is null/0 when no entry has playtime stamps', () => {
    const entry = { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-05T00:00:00.000Z') };
    expect(summarizeActiveHoursToBeat([entry])).toEqual({ averageHoursToBeat: null, hoursTrackedEntryCount: 0 });
  });

  it('averages active hours across entries with playtime stamps', () => {
    const result = summarizeActiveHoursToBeat([
      { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-05T00:00:00.000Z'), startPlaytimeMinutes: 60, finishPlaytimeMinutes: 660 }, // 10h
      { startedAt: new Date('2026-02-01T00:00:00.000Z'), finishedAt: new Date('2026-02-11T00:00:00.000Z'), startPlaytimeMinutes: 0, finishPlaytimeMinutes: 1200 }, // 20h
    ]);
    expect(result).toEqual({ averageHoursToBeat: 15, hoursTrackedEntryCount: 2 });
  });

  it('excludes entries missing either playtime stamp, without dropping others', () => {
    const noStamps = { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-05T00:00:00.000Z') };
    const partialStamps = {
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      finishedAt: new Date('2026-01-05T00:00:00.000Z'),
      startPlaytimeMinutes: 60,
      finishPlaytimeMinutes: null,
    };
    const withStamps = {
      startedAt: new Date('2026-02-01T00:00:00.000Z'),
      finishedAt: new Date('2026-02-11T00:00:00.000Z'),
      startPlaytimeMinutes: 0,
      finishPlaytimeMinutes: 600,
    };
    expect(summarizeActiveHoursToBeat([noStamps, partialStamps, withStamps])).toEqual({ averageHoursToBeat: 10, hoursTrackedEntryCount: 1 });
  });

  it('excludes an entry where finish minutes did not exceed start minutes', () => {
    const flat = { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-05T00:00:00.000Z'), startPlaytimeMinutes: 100, finishPlaytimeMinutes: 100 };
    expect(summarizeActiveHoursToBeat([flat])).toEqual({ averageHoursToBeat: null, hoursTrackedEntryCount: 0 });
  });

  it('rounds to one decimal place', () => {
    const result = summarizeActiveHoursToBeat([
      { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-05T00:00:00.000Z'), startPlaytimeMinutes: 0, finishPlaytimeMinutes: 90 }, // 1.5h
      { startedAt: new Date('2026-01-01T00:00:00.000Z'), finishedAt: new Date('2026-01-05T00:00:00.000Z'), startPlaytimeMinutes: 0, finishPlaytimeMinutes: 60 }, // 1h
    ]);
    expect(result).toEqual({ averageHoursToBeat: 1.3, hoursTrackedEntryCount: 2 });
  });
});

describe('pickMostNeglectedGame', () => {
  const now = new Date('2026-08-04T00:00:00.000Z').getTime();

  it('is null with no games', () => {
    expect(pickMostNeglectedGame([], now)).toBeNull();
  });

  it('is null when nothing currently reads as neglected', () => {
    const fresh = game({ id: 'fresh', createdAt: new Date('2026-07-20T00:00:00.000Z'), updatedAt: new Date('2026-07-20T00:00:00.000Z') });
    expect(pickMostNeglectedGame([fresh], now)).toBeNull();
  });

  it('ignores a non-backlog game even if old, same predicate as isNeglectedBacklogGame', () => {
    const oldWishlist = game({
      id: 'old-wishlist',
      status: 'wishlist',
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    expect(pickMostNeglectedGame([oldWishlist], now)).toBeNull();
  });

  it('picks the neglected candidate with the oldest last-activity, among several', () => {
    const mildlyNeglected = game({
      id: 'mild',
      title: 'Mildly Neglected',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    });
    const veryNeglected = game({
      id: 'very',
      title: 'Very Neglected',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const result = pickMostNeglectedGame([mildlyNeglected, veryNeglected], now);
    expect(result?.id).toBe('very');
    expect(result?.title).toBe('Very Neglected');
    expect(result?.lastActivityAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result?.daysSinceActivity).toBe(215);
  });

  it('treats a recent vote as the last-activity signal, same as isNeglectedBacklogGame', () => {
    // Old createdAt/updatedAt but a vote just before the neglect threshold would otherwise clear -
    // still not neglected (a recent vote resets the clock), so this stays null.
    const votedRecently = game({
      id: 'voted',
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
      votes: [{ createdAt: new Date('2026-08-01T00:00:00.000Z') }],
    });
    expect(pickMostNeglectedGame([votedRecently], now)).toBeNull();
  });
});

describe('bucketBacklogAge', () => {
  const now = new Date('2026-08-04T00:00:00.000Z').getTime();

  it('always returns all four buckets, zero-count ones included', () => {
    expect(bucketBacklogAge([], now)).toEqual([
      { label: 'Under 90 days', count: 0 },
      { label: '90-180 days', count: 0 },
      { label: '180-365 days', count: 0 },
      { label: '365+ days', count: 0 },
    ]);
  });

  it('buckets by days since createdAt', () => {
    const games = [
      { createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000) }, // 10 days -> bucket 0
      { createdAt: new Date(now - 100 * 24 * 60 * 60 * 1000) }, // 100 days -> bucket 1
      { createdAt: new Date(now - 200 * 24 * 60 * 60 * 1000) }, // 200 days -> bucket 2
      { createdAt: new Date(now - 400 * 24 * 60 * 60 * 1000) }, // 400 days -> bucket 3
    ];
    expect(bucketBacklogAge(games, now)).toEqual([
      { label: 'Under 90 days', count: 1 },
      { label: '90-180 days', count: 1 },
      { label: '180-365 days', count: 1 },
      { label: '365+ days', count: 1 },
    ]);
  });

  it('places a game exactly on a bucket edge into the older bucket (edge is exclusive on the lower bucket)', () => {
    const exactly90 = [{ createdAt: new Date(now - 90 * 24 * 60 * 60 * 1000) }];
    expect(bucketBacklogAge(exactly90, now)).toEqual([
      { label: 'Under 90 days', count: 0 },
      { label: '90-180 days', count: 1 },
      { label: '180-365 days', count: 0 },
      { label: '365+ days', count: 0 },
    ]);
  });
});
