import { describe, it, expect } from 'vitest';
import { platformFamilies, escapeApicalypseString, isPrimaryEdition, type IgdbPlatform, type IgdbGame } from './igdbClient.js';

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
