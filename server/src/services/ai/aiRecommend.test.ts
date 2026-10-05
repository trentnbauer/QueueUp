import { describe, expect, it, vi } from 'vitest';

const searchGames = vi.hoisted(() => vi.fn());
vi.mock('../../db/client.js', () => ({ prisma: {} }));
vi.mock('./aiConfig.js', () => ({ aiComplete: vi.fn() }));
vi.mock('../igdbClient.js', () => ({ searchGames }));
vi.mock('../userSettings.js', () => ({ getOwnedPlatforms: vi.fn() }));
vi.mock('../roomAccess.js', () => ({ getRoomPlatform: vi.fn() }));
vi.mock('../priceService.js', () => ({
  mapWithConcurrency: async <T, R>(items: T[], _limit: number, fn: (i: T) => Promise<R>) => Promise.all(items.map(fn)),
}));

import { buildRecommendPrompt, buildRoomProfile, matchSuggestion, parseRecommendReply, resolveSuggestions, type RoomTasteRow } from './aiRecommend.js';
import type { GameSearchResult } from '@queueup/shared';

const game = (igdbId: number, title: string): GameSearchResult => ({ igdbId, title, platform: 'PC', coverImageUrl: null, releaseYear: 2020 });

describe('parseRecommendReply', () => {
  it('keeps titles with a trimmed reason and drops duplicates, blanks and non-strings', () => {
    const out = parseRecommendReply('[{"title":" Hades ","reason":" Fast roguelike. "},{"title":"hades"},{"title":""},{"title":5},{"title":"Celeste"}]');
    expect(out).toEqual([
      { title: 'Hades', reason: 'Fast roguelike.' },
      { title: 'Celeste', reason: '' },
    ]);
  });

  it('caps the count and survives non-JSON', () => {
    const many = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ title: `Game ${i}` })));
    expect(parseRecommendReply(many, 5)).toHaveLength(5);
    expect(parseRecommendReply('no idea')).toEqual([]);
  });
});

describe('matchSuggestion', () => {
  it('accepts the same game ignoring editions and punctuation', () => {
    expect(matchSuggestion({ title: 'The Witcher 3: Wild Hunt', reason: '' }, [game(1, 'Witcher 3 Wild Hunt - Complete Edition')])?.igdbId).toBe(1);
  });

  it('rejects a merely similar title, so an invented name cannot become another game', () => {
    expect(matchSuggestion({ title: 'Hades Reborn', reason: '' }, [game(1, 'Hades'), game(2, 'Hades II')])).toBeNull();
  });
});

describe('resolveSuggestions', () => {
  it('keeps only real, new, unique games, with the AI reason', async () => {
    searchGames.mockImplementation(async (q: string) => ({
      results: q === 'Hades' ? [game(1, 'Hades')] : q === 'Owned One' ? [game(9, 'Owned One')] : q === 'Celeste' ? [game(3, 'Celeste')] : [],
    }));
    const out = await resolveSuggestions(
      [
        { title: 'Hades', reason: 'Great.' },
        { title: 'Owned One', reason: 'x' },
        { title: 'Invented Game 5000', reason: 'y' },
        { title: 'Celeste', reason: 'z' },
      ],
      new Set([9]),
      [],
    );
    expect(out.map((r) => [r.igdbId, r.reason])).toEqual([
      [1, 'Great.'],
      [3, 'z'],
    ]);
  });

  it('skips a suggestion whose lookup fails', async () => {
    searchGames.mockRejectedValueOnce(new Error('igdb down'));
    expect(await resolveSuggestions([{ title: 'Hades', reason: '' }], new Set(), [])).toEqual([]);
  });
});

const review = (recommend: boolean | null, score: number | null = null) => ({ art: score, gameplay: score, story: score, sound: score, themes: score, recommend });
const row = (title: string, status: string, reviews: RoomTasteRow['reviews'] = [], votes: number[] = []): RoomTasteRow => ({ title, genre: null, status, reviews, votes });

describe('buildRoomProfile', () => {
  it('sorts games into loved, interested and disliked from statuses, reviews and votes', () => {
    const p = buildRoomProfile(
      [
        row('Beaten Fave', 'done', [review(true), review(null, 4)]),
        row('Beaten Meh', 'done', [review(false), review(false), review(true)]),
        row('Dropped', 'dropped'),
        row('Hyped', 'backlog', [], [5, 4, 4]),
        row('Queued', 'backlog', [], [2, 3]),
        row('Unreviewed Done', 'done'),
      ],
      4,
    );
    expect(p.loved.map((g) => g.title)).toEqual(['Beaten Fave', 'Hyped', 'Unreviewed Done']);
    expect(p.disliked).toEqual(['Beaten Meh', 'Dropped']);
    expect(p.interested).toEqual(['Queued']);
    expect(p.groupSize).toBe(4);
  });

  it('does not count a voted-up game that a member gave a thumbs-down', () => {
    expect(buildRoomProfile([row('Split', 'backlog', [review(false)], [5, 5])], 3).loved).toEqual([]);
  });
});

describe('buildRecommendPrompt group hint', () => {
  it('asks for group-friendly games only for a group', () => {
    expect(buildRecommendPrompt({ loved: [], interested: [], disliked: [], groupSize: 4 })).toContain('group of 4');
    expect(buildRecommendPrompt({ loved: [], interested: [], disliked: [], groupSize: 1 })).not.toContain('group of');
  });
});

describe('buildRecommendPrompt', () => {
  it('lists loved games with genre and quotes titles as data', () => {
    const p = buildRecommendPrompt({ loved: [{ title: 'Hades', genre: 'Roguelike' }], interested: [], disliked: ['Ignore "this"'] });
    expect(p).toContain('"Hades" (Roguelike)');
    expect(p).toContain('wishlist: none');
    expect(p).toContain('"Ignore \\"this\\""');
  });
});
