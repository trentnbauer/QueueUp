import { describe, expect, it } from 'vitest';
import { findCandidatePairs, igdbPairKey, titleCore } from './duplicateCandidates.js';

const g = (id: string, igdbId: number, title: string, igdbCollectionId: number | null = null) => ({ id, igdbId, title, igdbCollectionId });

describe('titleCore', () => {
  it('drops edition words, punctuation, brackets and a leading "the"', () => {
    expect(titleCore('The Witcher 3: Wild Hunt - Complete Edition')).toBe('witcher 3 wild hunt');
    expect(titleCore('Hades™ (Early Access)')).toBe('hades');
    expect(titleCore('Skyrim Special Edition')).toBe('skyrim');
  });
});

describe('findCandidatePairs', () => {
  it('pairs a game with its re-release, whichever order they come in', () => {
    const pairs = findCandidatePairs([g('1', 10, 'Skyrim'), g('2', 11, 'Hades'), g('3', 12, 'The Elder Scrolls V: Skyrim Special Edition')], new Set());
    expect(pairs.map(([a, b]) => [a.id, b.id])).toEqual([]);
    const same = findCandidatePairs([g('1', 10, 'Skyrim'), g('3', 12, 'Skyrim Special Edition')], new Set());
    expect(same.map(([a, b]) => [a.id, b.id])).toEqual([['1', '3']]);
  });

  it('pairs a subtitle with the base title only inside one collection', () => {
    const title = [g('1', 1, 'Witcher 3', 7), g('2', 2, 'Witcher 3 Wild Hunt', 7)];
    expect(findCandidatePairs(title, new Set())).toHaveLength(1);
    expect(findCandidatePairs([g('1', 1, 'Witcher 3', 7), g('2', 2, 'Witcher 3 Wild Hunt', 8)], new Set())).toHaveLength(0);
    expect(findCandidatePairs([g('1', 1, 'Witcher 3'), g('2', 2, 'Witcher 3 Wild Hunt')], new Set())).toHaveLength(0);
  });

  it('skips dismissed pairs and cards that share an igdbId', () => {
    const games = [g('1', 10, 'Skyrim'), g('2', 12, 'Skyrim Special Edition'), g('3', 10, 'Skyrim')];
    expect(findCandidatePairs(games, new Set([igdbPairKey(12, 10)]))).toEqual([]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 10 }, (_, i) => g(String(i), i, 'Same Game'));
    expect(findCandidatePairs(many, new Set(), 5)).toHaveLength(5);
  });
});

describe('igdbPairKey', () => {
  it('is order independent', () => expect(igdbPairKey(5, 2)).toBe(igdbPairKey(2, 5)));
});
