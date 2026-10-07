import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('./redisClient.js', () => ({ redis: { get: vi.fn(), set: vi.fn() } }));
vi.mock('./igdbClient.js', () => ({ getCollectionGames: vi.fn() }));

import { MIN_GAP_DAYS, earlierMissing, planPrefill, type PrefillGame } from './seriesPrefill.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2015, 0, 1);
let n = 0;
const game = (over: Partial<PrefillGame> & { yearsAfter?: number } = {}): PrefillGame => {
  n += 1;
  const { yearsAfter = 0, ...rest } = over;
  return { id: `g${n}`, igdbCollectionId: 7, releaseTs: T0 + yearsAfter * 365 * DAY, status: 'backlog', prerequisiteGameId: null, prerequisiteSource: null, baseGameId: null, ...rest };
};

describe('planPrefill', () => {
  it('points a sequel at the closest earlier game of its series', () => {
    const one = game({ id: 'one', yearsAfter: 0 });
    const two = game({ id: 'two', yearsAfter: 2 });
    const three = game({ id: 'three', yearsAfter: 4 });
    expect(planPrefill([three, one, two], new Set(['three']))).toEqual([{ gameId: 'three', prerequisiteId: 'two' }]);
    expect(planPrefill([three, one, two], new Set(['one', 'two', 'three']))).toEqual([
      { gameId: 'two', prerequisiteId: 'one' },
      { gameId: 'three', prerequisiteId: 'two' },
    ]);
  });

  it('also fills an existing sequel when the earlier game is the one just added', () => {
    const one = game({ id: 'one', yearsAfter: 0 });
    const two = game({ id: 'two', yearsAfter: 2 });
    expect(planPrefill([one, two], new Set(['one']))).toEqual([{ gameId: 'two', prerequisiteId: 'one' }]);
  });

  it('leaves alone pairs that do not involve a game just added, so adding one game never reshuffles the library', () => {
    const one = game({ id: 'one', yearsAfter: 0 });
    const two = game({ id: 'two', yearsAfter: 2 });
    const other = game({ id: 'other', igdbCollectionId: 99 });
    expect(planPrefill([one, two, other], new Set(['other']))).toEqual([]);
  });

  it('never overwrites anything the person set or cleared (manual), or an earlier automatic one', () => {
    const one = game({ id: 'one', yearsAfter: 0 });
    expect(planPrefill([one, game({ id: 'a', yearsAfter: 2, prerequisiteSource: 'manual' })], new Set(['a']))).toEqual([]); // cleared by hand
    expect(planPrefill([one, game({ id: 'b', yearsAfter: 2, prerequisiteGameId: 'zzz', prerequisiteSource: 'manual' })], new Set(['b']))).toEqual([]);
    expect(planPrefill([one, game({ id: 'c', yearsAfter: 2, prerequisiteGameId: 'one', prerequisiteSource: 'auto' })], new Set(['c']))).toEqual([]);
  });

  it('skips finished or set-aside games on either side', () => {
    const settled = ['done', 'replay', 'dropped', 'wont_play'] as const;
    for (const status of settled) {
      expect(planPrefill([game({ id: 'p', status }), game({ id: 'q', yearsAfter: 2 })], new Set(['q'])), `earlier ${status}`).toEqual([]);
      expect(planPrefill([game({ id: 'p2' }), game({ id: 'q2', yearsAfter: 2, status })], new Set(['q2'])), `later ${status}`).toEqual([]);
    }
    // a wishlist, paused or playing earlier game still counts as not finished
    expect(planPrefill([game({ id: 'w', status: 'wishlist' }), game({ id: 'x', yearsAfter: 2 })], new Set(['x']))).toEqual([{ gameId: 'x', prerequisiteId: 'w' }]);
  });

  it('only acts when the two released far enough apart for the order to be trusted', () => {
    const early = game({ id: 'early', releaseTs: T0 });
    expect(planPrefill([early, game({ id: 'near', releaseTs: T0 + (MIN_GAP_DAYS - 1) * DAY })], new Set(['near']))).toEqual([]);
    expect(planPrefill([early, game({ id: 'far', releaseTs: T0 + MIN_GAP_DAYS * DAY })], new Set(['far']))).toEqual([{ gameId: 'far', prerequisiteId: 'early' }]);
  });

  it('ignores DLC, games with no release date, and games outside any series', () => {
    const one = game({ id: 'one', yearsAfter: 0 });
    expect(planPrefill([one, game({ id: 'dlc', yearsAfter: 2, baseGameId: 'one' })], new Set(['dlc']))).toEqual([]);
    expect(planPrefill([one, game({ id: 'nodate', releaseTs: null })], new Set(['nodate']))).toEqual([]);
    expect(planPrefill([one, game({ id: 'lone', yearsAfter: 2, igdbCollectionId: null })], new Set(['lone']))).toEqual([]);
  });

  it('keeps different series apart', () => {
    const a1 = game({ id: 'a1', igdbCollectionId: 1 });
    const b2 = game({ id: 'b2', igdbCollectionId: 2, yearsAfter: 3 });
    expect(planPrefill([a1, b2], new Set(['a1', 'b2']))).toEqual([]);
  });
});

describe('earlierMissing', () => {
  const series = {
    name: 'Mass Effect',
    truncated: false,
    games: [
      { igdbId: 1, title: 'ME1', platform: 'PC', coverImageUrl: null, releaseYear: 2007 },
      { igdbId: 2, title: 'ME2', platform: 'PC', coverImageUrl: null, releaseYear: 2010 },
      { igdbId: 3, title: 'ME3', platform: 'PC', coverImageUrl: null, releaseYear: 2012 },
      { igdbId: 4, title: 'Andromeda', platform: 'PC', coverImageUrl: null, releaseYear: 2017 },
      { igdbId: 5, title: 'Undated', platform: 'PC', coverImageUrl: null, releaseYear: null },
    ],
  };

  it('lists the earlier entries not on the list, and counts all the earlier ones', () => {
    const r = earlierMissing(series, { igdbId: 3, releaseYear: 2012 }, new Set([2]));
    expect(r?.earlierTotal).toBe(2);
    expect(r?.earlierMissing.map((g) => g.title)).toEqual(['ME1']);
    expect(r?.name).toBe('Mass Effect');
  });

  it('has nothing to say for the first game, a game with no year, or when every earlier entry is on the list', () => {
    expect(earlierMissing(series, { igdbId: 1, releaseYear: 2007 }, new Set()).earlierTotal).toBe(0);
    expect(earlierMissing(series, { igdbId: 3, releaseYear: null }, new Set())).toMatchObject({ earlierTotal: 0, earlierMissing: [] });
    expect(earlierMissing(series, { igdbId: 3, releaseYear: 2012 }, new Set([1, 2])).earlierMissing).toEqual([]);
  });

  it('leaves out entries from the same year and ones with no year, since their order is a guess', () => {
    const r = earlierMissing({ ...series, games: [...series.games, { igdbId: 6, title: 'Same year', platform: 'PC', coverImageUrl: null, releaseYear: 2012 }] }, { igdbId: 3, releaseYear: 2012 }, new Set());
    expect(r?.earlierMissing.map((g) => g.title)).toEqual(['ME1', 'ME2']);
  });
});
