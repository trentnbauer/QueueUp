import { describe, expect, it } from 'vitest';
import type { DuplicateSuggestionGame } from '@queueup/shared';
import { buildSpecialPrompt, isSpecialTitle, parseSpecialReply, relatedCards, significantWords } from './specialTitles.js';

let n = 0;
const card = (title: string, year: number | null = null): DuplicateSuggestionGame => {
  n += 1;
  return { id: `g${n}`, igdbId: 1000 + n, title, platform: 'PC', releaseYear: year, coverImageUrl: null, status: 'backlog', genre: null };
};

describe('isSpecialTitle', () => {
  it('flags collections, bundles, remasters, remakes and edition names', () => {
    for (const t of ['Halo: The Master Chief Collection', 'Mass Effect Legendary Edition', 'Resident Evil 4 Remake', 'Crash Bandicoot N. Sane Trilogy', 'Skyrim Anniversary Edition', 'Bioshock Remastered', 'Fallout 4 GOTY']) {
      expect(isSpecialTitle(t), t).toBe(true);
    }
  });
  it('leaves plain titles alone', () => {
    for (const t of ['Hades', 'Portal 2', 'Halo: Combat Evolved']) expect(isSpecialTitle(t), t).toBe(false);
  });
});

describe('significantWords', () => {
  it('keeps what makes the game itself', () => {
    expect(significantWords('Halo: The Master Chief Collection')).toEqual(['halo', 'master', 'chief']);
  });
});

describe('relatedCards', () => {
  it('finds the cards a collection is about, wherever they sort', () => {
    const collection = card('Halo: The Master Chief Collection');
    const shelf = [card('Zelda'), card('Halo: Combat Evolved'), card('Halo 3'), card('Hades'), card('Master of Orion'), collection];
    const titles = relatedCards(collection, shelf).map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(['Halo 3', 'Halo: Combat Evolved']));
    expect(titles).not.toContain('Zelda');
    expect(titles).not.toContain('Hades');
  });
  it('never includes the card itself or another card of its own IGDB game', () => {
    const a = card('Doom Eternal');
    expect(relatedCards(a, [a, { ...a, id: 'other' }])).toEqual([]);
  });
});

describe('parseSpecialReply', () => {
  const special = card('The Last of Us Part I', 2022);
  const original = card('The Last of Us', 2013);
  const batch = [{ card: special, others: [original] }];

  it('turns remaster, remake and contains into links, and same into a duplicate', () => {
    const remake = parseSpecialReply('[{"card":1,"other":1,"relation":"remake","confidence":0.9,"reason":"Rebuilt for PS5"}]', batch);
    expect(remake).toHaveLength(1);
    expect(remake[0]).toMatchObject({ relation: 'remake', keep: 'b', reason: 'Rebuilt for PS5' });
    expect(remake[0].a.id).toBe(special.id);

    const bundle = parseSpecialReply('[{"card":1,"other":1,"relation":"contains","confidence":0.8}]', batch);
    expect(bundle[0].relation).toBe('bundle');

    const same = parseSpecialReply('[{"card":1,"other":1,"relation":"same","confidence":0.95}]', batch);
    expect(same[0].relation).toBeUndefined();
    expect(same[0].keep).toBe('b');
  });

  it('ignores low confidence, unknown numbers, unknown relations and repeats', () => {
    expect(parseSpecialReply('[{"card":1,"other":1,"relation":"remake","confidence":0.4}]', batch)).toEqual([]);
    expect(parseSpecialReply('[{"card":2,"other":1,"relation":"remake","confidence":0.9}]', batch)).toEqual([]);
    expect(parseSpecialReply('[{"card":1,"other":3,"relation":"remake","confidence":0.9}]', batch)).toEqual([]);
    expect(parseSpecialReply('[{"card":1,"other":1,"relation":"sequel","confidence":0.9}]', batch)).toEqual([]);
    expect(parseSpecialReply('[{"card":1,"other":1,"relation":"remake","confidence":0.9},{"card":1,"other":1,"relation":"remake","confidence":0.9}]', batch)).toHaveLength(1);
    expect(parseSpecialReply('not json', batch)).toEqual([]);
  });
});

describe('buildSpecialPrompt', () => {
  it('numbers each card and its others', () => {
    const text = buildSpecialPrompt([{ card: card('A Collection'), others: [card('A'), card('B')] }]);
    expect(text).toContain('CARD 1:');
    expect(text).toContain('OTHER 2:');
  });
});
