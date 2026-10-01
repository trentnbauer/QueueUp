import { describe, it, expect } from 'vitest';
import { pickTitlesToRefresh } from './achievementProgress.js';

const t = (igdbId: number, steamAppid: number) => ({ igdbId, steamAppid });

describe('pickTitlesToRefresh', () => {
  it('always re-checks titles that were just played, checked before or not', () => {
    const picked = pickTitlesToRefresh([t(1, 10), t(2, 20)], new Set([10]), new Set([1, 2]), 0);
    expect(picked).toEqual([t(1, 10)]);
  });

  it('backfills never-checked titles up to the limit', () => {
    const picked = pickTitlesToRefresh([t(1, 10), t(2, 20), t(3, 30), t(4, 40)], new Set(), new Set([2]), 2);
    expect(picked).toEqual([t(1, 10), t(3, 30)]);
  });

  it('counts a title once when a shelf and a room both have it', () => {
    const picked = pickTitlesToRefresh([t(1, 10), t(1, 10), t(2, 20)], new Set([10]), new Set(), 5);
    expect(picked).toEqual([t(1, 10), t(2, 20)]);
  });
});
