import { describe, it, expect } from 'vitest';
import {
  platformFamilies,
  escapeApicalypseString,
  isPrimaryEdition,
  sortExactMatchFirst,
  timeToBeatHoursFrom,
  timeToBeatRushedHoursFrom,
  timeToBeatCompletionistHoursFrom,
  reviewScoreFrom,
  type IgdbPlatform,
  type IgdbGame,
  type IgdbTimeToBeat,
} from './igdbClient.js';

function names(...n: string[]): IgdbPlatform[] {
  return n.map((name) => ({ name }));
}

describe('platformFamilies', () => {
  it('maps common IGDB platform names to the right family', () => {
    expect(platformFamilies(names('PC (Microsoft Windows)'))).toEqual(['pc']);
    expect(platformFamilies(names('Xbox Series X|S'))).toEqual(['xbox_series']);
    expect(platformFamilies(names('PlayStation 5'))).toEqual(['ps5']);
    expect(platformFamilies(names('Nintendo Switch'))).toEqual(['switch']);
  });

  it('distinguishes Switch 2 from plain Switch (order-dependent substring match)', () => {
    expect(platformFamilies(names('Nintendo Switch 2'))).toEqual(['switch2']);
    expect(platformFamilies(names('Nintendo Switch'))).toEqual(['switch']);
  });

  it('deduplicates when multiple platform names map to the same family', () => {
    expect(platformFamilies(names('Mac', 'PC (Microsoft Windows)', 'Linux'))).toEqual(['pc']);
  });

  it('collects every distinct family for a multi-platform game', () => {
    const result = platformFamilies(names('PC (Microsoft Windows)', 'Xbox One', 'PlayStation 4', 'Nintendo Switch'));
    expect(new Set(result)).toEqual(new Set(['pc', 'xbox_one', 'ps4', 'switch']));
  });

  it('returns an empty array for platforms with no recognizable family', () => {
    expect(platformFamilies(names('Wii U 2000'))).toEqual([]);
  });

  it('handles missing/empty input', () => {
    expect(platformFamilies(undefined)).toEqual([]);
    expect(platformFamilies([])).toEqual([]);
    expect(platformFamilies([{ name: undefined }])).toEqual([]);
  });
});

describe('escapeApicalypseString', () => {
  it('escapes a bare double quote', () => {
    expect(escapeApicalypseString('a"b')).toBe('a\\"b');
  });

  it('escapes backslashes before quotes so an attacker cannot smuggle an unescaped quote', () => {
    // If quotes were escaped without first escaping backslashes, this input's trailing `\"`
    // would become `\\"` in the output - read as an escaped backslash followed by an *unescaped*
    // quote, closing the string early and letting the rest of the input inject raw query syntax.
    const malicious = 'foo\\"; fields *; where 1=1;"';
    const escaped = escapeApicalypseString(malicious);
    expect(escaped).toBe('foo\\\\\\"; fields *; where 1=1;\\"');

    const query = `search "${escaped}";`;
    // The escaped payload must not contain an unescaped quote - i.e. every `"` in the query is
    // immediately preceded by an odd number of backslashes.
    expect(query.match(/(?<!\\)(\\\\)*"/g)).toEqual(['"', '"']);
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeApicalypseString('Mario Kart World')).toBe('Mario Kart World');
  });
});

function game(overrides: Partial<IgdbGame> = {}): IgdbGame {
  return { id: 1, name: 'Some Game', ...overrides };
}

describe('isPrimaryEdition', () => {
  it('accepts a canonical game with no version_parent and no category', () => {
    expect(isPrimaryEdition(game())).toBe(true);
  });

  it('rejects a special/deluxe/GOTY edition linked back to a canonical release', () => {
    expect(isPrimaryEdition(game({ version_parent: 42 }))).toBe(false);
  });

  it('rejects bundles and packs', () => {
    expect(isPrimaryEdition(game({ category: 3 }))).toBe(false); // bundle
    expect(isPrimaryEdition(game({ category: 13 }))).toBe(false); // pack
  });

  it('keeps DLC and expansions, which are their own distinct canonical entries', () => {
    expect(isPrimaryEdition(game({ category: 1 }))).toBe(true); // dlc_addon
    expect(isPrimaryEdition(game({ category: 2 }))).toBe(true); // expansion
  });
});

describe('sortExactMatchFirst', () => {
  it('promotes an exact case-insensitive title match ahead of same-franchise partial matches', () => {
    // Reproduces the "God of War" search bug: the 2018 game is titled identically to the 2005
    // original, and without this promotion it can rank behind franchise entries like Ragnarök.
    const godOfWarRagnarok = game({ id: 1, name: 'God of War Ragnarök' });
    const godOfWar2018 = game({ id: 2, name: 'God of War' });
    const godOfWarAscension = game({ id: 3, name: 'God of War: Ascension' });

    const result = sortExactMatchFirst([godOfWarRagnarok, godOfWar2018, godOfWarAscension], 'God of War');

    expect(result[0]).toBe(godOfWar2018);
  });

  it('matches case-insensitively and ignores leading/trailing whitespace in the query', () => {
    const match = game({ id: 1, name: 'God of War' });
    const other = game({ id: 2, name: 'God of War Ragnarök' });

    const result = sortExactMatchFirst([other, match], '  god of war  ');

    expect(result[0]).toBe(match);
  });

  it('is a stable sort that leaves relative order untouched when there is no exact match', () => {
    const a = game({ id: 1, name: 'God of War: Ascension' });
    const b = game({ id: 2, name: 'God of War Ragnarök' });

    expect(sortExactMatchFirst([a, b], 'God of War')).toEqual([a, b]);
  });

  it('does not mutate the input array', () => {
    const match = game({ id: 1, name: 'God of War' });
    const other = game({ id: 2, name: 'God of War Ragnarök' });
    const input = [other, match];

    sortExactMatchFirst(input, 'God of War');

    expect(input).toEqual([other, match]);
  });
});

describe('time-to-beat breakdown (issue #248)', () => {
  const rows: IgdbTimeToBeat[] = [{ normally: 36000, hastily: 18000, completely: 72000 }]; // 10h/5h/20h

  it('converts each tier from seconds to rounded hours', () => {
    expect(timeToBeatHoursFrom(rows)).toBe(10);
    expect(timeToBeatRushedHoursFrom(rows)).toBe(5);
    expect(timeToBeatCompletionistHoursFrom(rows)).toBe(20);
  });

  it('rounds to the nearest hour rather than truncating', () => {
    expect(timeToBeatHoursFrom([{ normally: 9000 }])).toBe(3); // 2.5h -> 3h
  });

  it('returns null per-tier when that tier is missing, zero, or negative, independent of the others', () => {
    expect(timeToBeatHoursFrom([{ hastily: 3600, completely: 7200 }])).toBeNull();
    expect(timeToBeatRushedHoursFrom([{ normally: 3600, hastily: 0 }])).toBeNull();
    expect(timeToBeatCompletionistHoursFrom([{ completely: -1 }])).toBeNull();
  });

  it('returns null for all tiers when there are no rows at all', () => {
    expect(timeToBeatHoursFrom([])).toBeNull();
    expect(timeToBeatRushedHoursFrom([])).toBeNull();
    expect(timeToBeatCompletionistHoursFrom([])).toBeNull();
  });
});

describe('reviewScoreFrom (issue #311)', () => {
  it('prefers total_rating over the other two when present', () => {
    expect(reviewScoreFrom({ id: 1, total_rating: 82.4, aggregated_rating: 60, rating: 40 })).toBe(82);
  });

  it('falls back to aggregated_rating when total_rating is missing', () => {
    expect(reviewScoreFrom({ id: 1, aggregated_rating: 75.6, rating: 40 })).toBe(76);
  });

  it('falls back to rating when neither of the other two is present', () => {
    expect(reviewScoreFrom({ id: 1, rating: 55.2 })).toBe(55);
  });

  it('returns null when IGDB has no review data at all for this game', () => {
    expect(reviewScoreFrom({ id: 1 })).toBeNull();
  });
});
