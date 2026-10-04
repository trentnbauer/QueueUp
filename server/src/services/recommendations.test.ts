import { describe, expect, it, vi } from 'vitest';
import type { SimilarGameCandidate } from './igdbClient.js';

vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('./redisClient.js', () => ({ redis: {} }));
const { pickSeeds, rankCandidates } = await import('./recommendations.js');

const candidate = (over: Record<string, unknown>): SimilarGameCandidate => ({
  igdbId: 1,
  title: 'Game',
  platform: 'PC',
  coverImageUrl: null,
  releaseYear: 2024,
  hits: 1,
  becauseOf: 100,
  reviewScore: 80,
  ratingCount: 100,
  playModes: { singlePlayerOnly: false, coop: false },
  platformFamilies: ['pc'],
  ...over,
}) as SimilarGameCandidate;

describe('pickSeeds', () => {
  it('prefers beaten and playing games, and skips dropped and Won\'t play', () => {
    const seeds = pickSeeds([
      { igdbId: 1, title: 'Backlog', status: 'backlog', voteScore: 3, reviewScore: 70 },
      { igdbId: 2, title: 'Beaten', status: 'done', voteScore: 0, reviewScore: 90 },
      { igdbId: 3, title: 'Dropped', status: 'dropped', voteScore: 20, reviewScore: 95 },
      { igdbId: 4, title: 'Nope', status: 'wont_play', voteScore: 0, reviewScore: null },
    ]);
    expect(seeds.map((s) => s.igdbId)).toEqual([2, 1]);
  });
});

describe('rankCandidates', () => {
  const titles = new Map([[100, 'Hades II']]);

  it('ranks games several seeds agree on first and says why', () => {
    const out = rankCandidates([candidate({ igdbId: 1, hits: 1 }), candidate({ igdbId: 2, hits: 3 })], { titles });
    expect(out.map((r) => r.igdbId)).toEqual([2, 1]);
    expect(out[0].reason).toBe('Like Hades II');
  });

  it('filters to co-op games and to playable platforms', () => {
    const list = [
      candidate({ igdbId: 1, playModes: { singlePlayerOnly: true, coop: false } }),
      candidate({ igdbId: 2, playModes: { singlePlayerOnly: false, coop: true }, platformFamilies: ['ps4'] }),
      candidate({ igdbId: 3, playModes: { singlePlayerOnly: false, coop: true }, platformFamilies: ['switch'] }),
    ];
    expect(rankCandidates(list, { titles, coopOnly: true }).map((r) => r.igdbId)).toEqual([2, 3]);
    // PS5 plays PS4 games.
    expect(rankCandidates(list, { titles, coopOnly: true, platforms: ['ps5'] }).map((r) => r.igdbId)).toEqual([2]);
  });
});
