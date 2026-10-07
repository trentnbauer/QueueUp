import { describe, expect, it, vi } from 'vitest';

vi.mock('./redisClient.js', () => ({ redis: { get: vi.fn(), set: vi.fn() } }));

import { hasEsrbAdultsOnly } from './igdbClient.js';

describe('hasEsrbAdultsOnly', () => {
  it('is true for ESRB Adults Only in IGDB\'s current shape (organization + rating_category)', () => {
    expect(hasEsrbAdultsOnly([{ organization: { name: 'ESRB' }, rating_category: { rating: 'AO' } }])).toBe(true);
    expect(hasEsrbAdultsOnly([{ organization: { name: 'PEGI' }, rating_category: { rating: '18' } }, { organization: { name: 'esrb' }, rating_category: { rating: 'ao' } }])).toBe(true);
  });

  it('is true for ESRB Adults Only in the older numeric shape (category 1, rating 12)', () => {
    expect(hasEsrbAdultsOnly([{ category: 1, rating: 12 }])).toBe(true);
  });

  it('is false for the ratings mainstream adult games carry: ESRB Mature, PEGI 18, and a PEGI 12 that shares the number', () => {
    expect(hasEsrbAdultsOnly([{ organization: { name: 'ESRB' }, rating_category: { rating: 'M' } }])).toBe(false);
    expect(hasEsrbAdultsOnly([{ organization: { name: 'PEGI' }, rating_category: { rating: '18' } }])).toBe(false);
    expect(hasEsrbAdultsOnly([{ category: 2, rating: 12 }])).toBe(false); // PEGI category with rating 12 is not ESRB AO
    expect(hasEsrbAdultsOnly([{ category: 1, rating: 11 }])).toBe(false); // ESRB M
  });

  it('is false for no ratings or nonsense', () => {
    expect(hasEsrbAdultsOnly(undefined)).toBe(false);
    expect(hasEsrbAdultsOnly(null)).toBe(false);
    expect(hasEsrbAdultsOnly([])).toBe(false);
    expect(hasEsrbAdultsOnly([null as never, 7 as never, {}])).toBe(false);
  });
});
