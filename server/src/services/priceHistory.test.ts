import { describe, expect, it } from 'vitest';
import { goodTimeReason, isMeaningfulFurtherDrop, usualPrice } from './priceHistory.js';

const pts = (...amounts: number[]) => amounts.map((amount) => ({ amount }));

describe('usualPrice', () => {
  it('is the median of the recorded prices', () => {
    expect(usualPrice(pts(30, 30, 20, 30, 10))).toBe(30);
    expect(usualPrice(pts(10, 20, 30, 40, 50, 60))).toBe(35);
  });

  it('is null without enough history', () => {
    expect(usualPrice(pts(30, 30, 20, 30))).toBeNull();
  });
});

describe('goodTimeReason', () => {
  it('is near_low when within 5% of gg.deals all-time low', () => {
    expect(goodTimeReason(10.4, [], 10)).toBe('near_low');
    expect(goodTimeReason(10.6, [], 10)).toBeNull();
  });

  it('does not treat a first reading as the lowest ever', () => {
    expect(goodTimeReason(30, pts(30), null)).toBeNull();
    expect(goodTimeReason(30, pts(30, 30, 30, 30), null)).toBeNull();
  });

  it('uses our own recorded lows once there is enough history', () => {
    expect(goodTimeReason(15, pts(30, 30, 30, 30, 15), null)).toBe('near_low');
  });

  it('is below_usual when at least 20% under the usual price', () => {
    // Usual 30 (median of 30,30,30,30,12) and gg.deals low of 5, so only the 20%-under rule applies.
    expect(goodTimeReason(23, pts(30, 30, 30, 30, 12), 5)).toBe('below_usual');
    expect(goodTimeReason(25, pts(30, 30, 30, 30, 12), 5)).toBeNull();
  });
});

describe('isMeaningfulFurtherDrop', () => {
  it('always qualifies when nothing has been alerted yet', () => {
    expect(isMeaningfulFurtherDrop(78.78, null)).toBe(true);
  });

  it('ignores a few cents of jitter under the last alerted price', () => {
    expect(isMeaningfulFurtherDrop(78.59, 78.78)).toBe(false);
    expect(isMeaningfulFurtherDrop(78.78, 78.78)).toBe(false);
  });

  it('re-alerts once the price falls at least 5% further', () => {
    expect(isMeaningfulFurtherDrop(74.84, 78.78)).toBe(true);
    expect(isMeaningfulFurtherDrop(60, 78.78)).toBe(true);
  });
});
