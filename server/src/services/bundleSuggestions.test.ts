import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBundleContents, searchGames } = vi.hoisted(() => ({ getBundleContents: vi.fn(), searchGames: vi.fn() }));
vi.mock('./igdbClient.js', () => ({
  getBundleContents,
  searchGames,
  normalizeGameTitleForComparison: (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ''),
}));

import { splitBundleTitle, suggestBundleGames } from './bundleSuggestions.js';

const game = (igdbId: number, title: string) => ({ igdbId, title, platform: 'PC', coverImageUrl: null, releaseYear: 2010 });

describe('splitBundleTitle', () => {
  it('splits a title that lists its games', () => {
    expect(splitBundleTitle('Portal + Half-Life 2')).toEqual(['Portal', 'Half-Life 2']);
    expect(splitBundleTitle('Fallout 3 / Fallout: New Vegas')).toEqual(['Fallout 3', 'Fallout: New Vegas']);
  });

  it('drops a trailing Bundle, Collection or Pack word first', () => {
    expect(splitBundleTitle('Doom + Doom II Bundle')).toEqual(['Doom', 'Doom II']);
    expect(splitBundleTitle('Hades + Celeste Double Pack')).toEqual(['Hades', 'Celeste']);
  });

  it('leaves titles with "&" or "and" in the name alone', () => {
    expect(splitBundleTitle('Ratchet & Clank')).toEqual([]);
    expect(splitBundleTitle('Command and Conquer')).toEqual([]);
    expect(splitBundleTitle('Mass Effect Legendary Edition')).toEqual([]);
  });
});

describe('suggestBundleGames', () => {
  beforeEach(() => {
    getBundleContents.mockReset();
    searchGames.mockReset();
  });

  it('puts what IGDB lists first, adds title matches, and never suggests the bundle or a repeat', async () => {
    getBundleContents.mockResolvedValue([game(2, 'Portal')]);
    searchGames.mockImplementation(async (q: string) => ({
      results: q === 'Portal' ? [game(1, 'Portal Bundle'), game(2, 'Portal')] : [game(3, 'Half-Life 2'), game(4, 'Half-Life 2: Episode One')],
    }));
    const out = await suggestBundleGames({ igdbId: 1, title: 'Portal + Half-Life 2' });
    expect(out.map((s) => [s.igdbId, s.source])).toEqual([[2, 'igdb'], [3, 'title']]);
  });

  it('skips a title part that matches nothing, and survives IGDB failing', async () => {
    getBundleContents.mockRejectedValue(new Error('down'));
    searchGames.mockImplementation(async (q: string) => {
      if (q === 'Nothing Like It') return { results: [game(9, 'Something Else')] };
      throw new Error('down');
    });
    expect(await suggestBundleGames({ igdbId: 1, title: 'Nothing Like It + Another One' })).toEqual([]);
  });
});
