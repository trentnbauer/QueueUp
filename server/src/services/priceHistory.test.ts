import { describe, expect, it } from 'vitest';
import { goodTimeReason, usualPrice } from './priceHistory.js';

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
