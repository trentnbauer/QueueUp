import { describe, expect, it } from 'vitest';
import { priceChartPath } from './PriceHistoryChart';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();

describe('priceChartPath', () => {
  it('is empty with fewer than two points', () => {
    expect(priceChartPath([])).toBe('');
    expect(priceChartPath([{ at: day(0), amount: 10 }])).toBe('');
  });

  it('draws a step line that holds each price until the next change', () => {
    const d = priceChartPath(
      [
        { at: day(0), amount: 20 },
        { at: day(10), amount: 10 },
        { at: day(20), amount: 20 },
      ],
      104,
      54,
      2,
    );
    // start at the first price (top-left), step across then down to 10, then across and back up.
    expect(d).toBe('M2.0,2.0 H52.0 V52.0 H102.0 V2.0');
  });

  it('draws a flat line in the middle when the price never changed', () => {
    const d = priceChartPath(
      [
        { at: day(0), amount: 5 },
        { at: day(5), amount: 5 },
      ],
      104,
      54,
      2,
    );
    expect(d).toBe('M2.0,27.0 H102.0 V27.0');
  });
});
