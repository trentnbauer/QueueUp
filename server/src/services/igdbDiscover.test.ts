import { describe, expect, it } from 'vitest';
import { buildDiscoverQuery, type DiscoverFilters } from './igdbClient.js';

const base: DiscoverFilters = { query: null, platforms: [], coop: false, genres: [], maxHours: null, releasedFrom: null, releasedTo: null };

describe('buildDiscoverQuery', () => {
  it('without text lists the best-rated games with the filters in the where clause', () => {
    const q = buildDiscoverQuery({ ...base, platforms: ['switch'], coop: true, genres: ['Puzzle'], releasedFrom: 2015, releasedTo: 2016 }, []);
    expect(q).toContain('platforms.name = (');
    expect(q).toContain('game_modes.name = ("Co-operative")');
    expect(q).toContain('genres.name = ("Puzzle")');
    expect(q).toContain(`first_release_date >= ${Date.UTC(2015, 0, 1) / 1000}`);
    expect(q).toContain(`first_release_date < ${Date.UTC(2017, 0, 1) / 1000}`);
    expect(q).toContain('total_rating_count > 0');
    expect(q).toContain('sort total_rating_count desc');
    expect(q).not.toContain('search ');
  });

  it('with text uses search and does not sort', () => {
    const q = buildDiscoverQuery({ ...base, query: 'farming' }, []);
    expect(q.startsWith('search "farming";')).toBe(true);
    expect(q).not.toContain('sort ');
  });

  it('falls back to the scope platforms only when the filters name none', () => {
    expect(buildDiscoverQuery(base, ['pc'])).toContain('platforms.name = (');
    expect(buildDiscoverQuery(base, [])).not.toContain('platforms.name = (');
  });

  it('escapes the free text and ignores a genre that is not on the list', () => {
    const q = buildDiscoverQuery({ ...base, query: 'a"b', genres: ['Puzzle', 'Nope"; drop'] }, []);
    expect(q).toContain('search "a\\"b";');
    expect(q).toContain('genres.name = ("Puzzle")');
    expect(q).not.toContain('Nope');
  });
});
