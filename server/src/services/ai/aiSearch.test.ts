import { describe, expect, it, vi } from 'vitest';

vi.mock('./aiConfig.js', () => ({ aiComplete: vi.fn() }));
vi.mock('../igdbClient.js', () => ({
  IGDB_GENRE_NAMES: ['Puzzle', 'Adventure', 'Role-playing (RPG)'],
}));

import { hasAnyFilter, parseSearchReply, sanitizeFilters } from './aiSearch.js';

const now = new Date('2026-10-01T00:00:00Z');

describe('sanitizeFilters', () => {
  it('keeps supported values', () => {
    expect(sanitizeFilters({ query: 'zelda', platforms: ['switch'], coop: true, genres: ['Puzzle'], maxHours: 8, releasedFrom: 2015, releasedTo: 2020 }, now)).toEqual({
      query: 'zelda',
      platforms: ['switch'],
      coop: true,
      genres: ['Puzzle'],
      maxHours: 8,
      releasedFrom: 2015,
      releasedTo: 2020,
    });
  });

  it('drops anything the app does not support', () => {
    const f = sanitizeFilters({ platforms: ['atari', 'switch', 5], genres: ['Cozy', 'Adventure'], coop: 'yes', maxHours: -3, releasedFrom: 1850, releasedTo: 'soon' }, now);
    expect(f).toEqual({ query: null, platforms: ['switch'], coop: false, genres: ['Adventure'], maxHours: null, releasedFrom: null, releasedTo: null });
  });

  it('swaps years given the wrong way round, rejects far-future years and huge lengths', () => {
    expect(sanitizeFilters({ releasedFrom: 2020, releasedTo: 2010 }, now)).toMatchObject({ releasedFrom: 2010, releasedTo: 2020 });
    expect(sanitizeFilters({ releasedFrom: 2099, maxHours: 9999 }, now)).toMatchObject({ releasedFrom: null, maxHours: null });
  });

  it('cleans the free text so it cannot break out of a query', () => {
    expect(sanitizeFilters({ query: ' a "quoted" \\ title ' }, now).query).toBe('a quoted title');
    expect(sanitizeFilters({ query: 'x'.repeat(500) }, now).query).toHaveLength(80);
  });

  it('survives junk', () => {
    expect(sanitizeFilters(null, now)).toEqual({ query: null, platforms: [], coop: false, genres: [], maxHours: null, releasedFrom: null, releasedTo: null });
    expect(sanitizeFilters('hello', now).coop).toBe(false);
  });
});

describe('parseSearchReply', () => {
  it('returns validated filters and what could not be applied', () => {
    const out = parseSearchReply('```json\n{"query":null,"platforms":["switch"],"coop":true,"genres":[],"maxHours":8,"unsupported":["under $20"," ",5]}\n```', now);
    expect(out?.filters).toMatchObject({ platforms: ['switch'], coop: true, maxHours: 8 });
    expect(out?.unsupported).toEqual(['under $20']);
  });

  it('is null for a reply that is not a JSON object', () => {
    expect(parseSearchReply('sure thing', now)).toBeNull();
    expect(parseSearchReply('[1,2]', now)).toBeNull();
  });
});

describe('hasAnyFilter', () => {
  it('is false for empty filters and true when any is set', () => {
    expect(hasAnyFilter(sanitizeFilters({}, now))).toBe(false);
    expect(hasAnyFilter(sanitizeFilters({ coop: true }, now))).toBe(true);
  });
});
