import { describe, expect, it } from 'vitest';
import type { GameSearchResult } from '@queueup/shared';
import { MAX_SUGGESTIONS, orderCandidates, type KnownGame } from './matchSuggestions.js';

const result = (igdbId: number, title = `Game ${igdbId}`): GameSearchResult => ({ igdbId, title, platform: 'PC', coverImageUrl: null, releaseYear: 2020 });
const known = (...ids: number[]): Map<number, KnownGame> => new Map(ids.map((id) => [id, result(id, `Known ${id}`)]));

describe('orderCandidates', () => {
  it('leaves IGDB candidates alone when nobody else matched the title', () => {
    expect(orderCandidates([result(1), result(2)], [], new Map()).map((c) => c.igdbId)).toEqual([1, 2]);
  });

  it('puts the most-picked suggestion first and says how many picked it', () => {
    const out = orderCandidates([result(1), result(2)], [{ igdbId: 2, count: 1 }, { igdbId: 9, count: 4 }], known(9));
    expect(out.map((c) => [c.igdbId, c.suggestedBy])).toEqual([
      [9, 4],
      [2, 1],
      [1, undefined],
    ]);
  });

  it('moves a pick IGDB also returned up instead of listing it twice', () => {
    const out = orderCandidates([result(1), result(2), result(3)], [{ igdbId: 3, count: 2 }], new Map());
    expect(out.map((c) => c.igdbId)).toEqual([3, 1, 2]);
    expect(out[0].suggestedBy).toBe(2);
  });

  it('takes the details of a pick IGDB did not return from the games we know', () => {
    const out = orderCandidates([result(1)], [{ igdbId: 7, count: 1 }], known(7));
    expect(out[0]).toMatchObject({ igdbId: 7, title: 'Known 7', suggestedBy: 1 });
  });

  it('skips a pick it knows nothing about', () => {
    expect(orderCandidates([result(1)], [{ igdbId: 7, count: 5 }], new Map()).map((c) => c.igdbId)).toEqual([1]);
  });

  it('shows at most three suggestions', () => {
    const picks = [1, 2, 3, 4, 5].map((id) => ({ igdbId: id, count: 10 - id }));
    const out = orderCandidates([], picks, known(1, 2, 3, 4, 5));
    expect(out).toHaveLength(MAX_SUGGESTIONS);
    expect(out.map((c) => c.igdbId)).toEqual([1, 2, 3]);
  });
});
