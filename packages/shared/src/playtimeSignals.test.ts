import { describe, it, expect } from 'vitest';
import type { Game } from './types.js';
import {
  suggestsPlaying,
  suggestsBeatenByPlaytime,
  suggestsPlayingFromMinutes,
  suggestsBeatenFromMinutes,
  suggestsDroppingStalePlaying,
  computePlaytimeReviewCandidates,
} from './playtimeSignals.js';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    roomId: null,
    addedBy: { id: 'u1', displayName: 'Dev', avatarColor: '#fff', avatarUrl: null, isAdmin: false },
    title: 'Test Game',
    platform: 'PC',
    genre: null,
    releaseYear: null,
    releaseDate: null,
    maxCoopPlayers: null,
    timeToBeatHours: null,
    timeToBeatRushedHours: null,
    timeToBeatCompletionistHours: null,
    ggDealsUrl: null,
    coverImageUrl: null,
    status: 'backlog',
    steamFullyCompleted: false,
    price: { amount: null, currency: null, source: 'unavailable', historicalLow: null, lastRefreshedAt: null },
    targetPrice: null,
    manualPrice: null,
    votes: [],
    myVote: null,
    voteScore: 0,
    youOwn: false,
    ownership: null,
    wishlist: null,
    ownedPlatforms: [],
    tags: [],
    igdbCollectionId: null,
    reviewScore: null,
    prerequisiteGameId: null,
    baseGameId: null,
    playtimeSinceCheckpointMinutes: null,
    currentPlaytimeMinutes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('suggestsPlaying', () => {
  it('is true for a backlog Personal Shelf game with playtime since checkpoint', () => {
    expect(suggestsPlaying(makeGame({ status: 'backlog', playtimeSinceCheckpointMinutes: 30 }))).toBe(true);
  });

  it('is false for a room game (no single unambiguous player)', () => {
    expect(suggestsPlaying(makeGame({ roomId: 'r1', status: 'backlog', playtimeSinceCheckpointMinutes: 30 }))).toBe(false);
  });

  it('is false when there is no playtime signal at all', () => {
    expect(suggestsPlaying(makeGame({ status: 'backlog', playtimeSinceCheckpointMinutes: null }))).toBe(false);
  });

  it('is false when playtime since checkpoint is 0', () => {
    expect(suggestsPlaying(makeGame({ status: 'backlog', playtimeSinceCheckpointMinutes: 0 }))).toBe(false);
  });

  it('is false when already Playing, Done, or Dropped', () => {
    expect(suggestsPlaying(makeGame({ status: 'playing', playtimeSinceCheckpointMinutes: 30 }))).toBe(false);
    expect(suggestsPlaying(makeGame({ status: 'done', playtimeSinceCheckpointMinutes: 30 }))).toBe(false);
    expect(suggestsPlaying(makeGame({ status: 'dropped', playtimeSinceCheckpointMinutes: 30 }))).toBe(false);
  });
});

describe('suggestsBeatenByPlaytime', () => {
  it('is true once hours played since checkpoint reach time-to-beat', () => {
    expect(
      suggestsBeatenByPlaytime(makeGame({ status: 'playing', timeToBeatHours: 10, playtimeSinceCheckpointMinutes: 600 })),
    ).toBe(true);
  });

  it('is false when under time-to-beat', () => {
    expect(
      suggestsBeatenByPlaytime(makeGame({ status: 'playing', timeToBeatHours: 10, playtimeSinceCheckpointMinutes: 300 })),
    ).toBe(false);
  });

  it('is false when not currently Playing', () => {
    expect(
      suggestsBeatenByPlaytime(makeGame({ status: 'backlog', timeToBeatHours: 10, playtimeSinceCheckpointMinutes: 600 })),
    ).toBe(false);
  });

  it('is false with no time-to-beat data', () => {
    expect(
      suggestsBeatenByPlaytime(makeGame({ status: 'playing', timeToBeatHours: null, playtimeSinceCheckpointMinutes: 600 })),
    ).toBe(false);
  });

  it('is false with no playtime signal', () => {
    expect(
      suggestsBeatenByPlaytime(makeGame({ status: 'playing', timeToBeatHours: 10, playtimeSinceCheckpointMinutes: null })),
    ).toBe(false);
  });
});

describe('suggestsPlayingFromMinutes', () => {
  it('is true for a backlog Personal Shelf game with positive minutes', () => {
    expect(suggestsPlayingFromMinutes('backlog', null, 30)).toBe(true);
  });

  it('is true even for a large raw total (e.g. a game never checkpointed before)', () => {
    expect(suggestsPlayingFromMinutes('backlog', null, 2400)).toBe(true);
  });

  it('is false for a room game', () => {
    expect(suggestsPlayingFromMinutes('backlog', 'r1', 30)).toBe(false);
  });

  it('is false at 0 minutes', () => {
    expect(suggestsPlayingFromMinutes('backlog', null, 0)).toBe(false);
  });

  it('is false when already Playing, Done, or Dropped', () => {
    expect(suggestsPlayingFromMinutes('playing', null, 30)).toBe(false);
    expect(suggestsPlayingFromMinutes('done', null, 30)).toBe(false);
    expect(suggestsPlayingFromMinutes('dropped', null, 30)).toBe(false);
  });
});

describe('suggestsBeatenFromMinutes', () => {
  it('is true once minutes reach time-to-beat, even from a raw first-sync total', () => {
    expect(suggestsBeatenFromMinutes('playing', 10, 2400)).toBe(true);
  });

  it('is false when under time-to-beat', () => {
    expect(suggestsBeatenFromMinutes('playing', 10, 300)).toBe(false);
  });

  it('is false when not currently Playing', () => {
    expect(suggestsBeatenFromMinutes('backlog', 10, 2400)).toBe(false);
  });

  it('is false with no time-to-beat data', () => {
    expect(suggestsBeatenFromMinutes('playing', null, 2400)).toBe(false);
  });
});

describe('suggestsDroppingStalePlaying', () => {
  const now = new Date('2026-08-04T00:00:00.000Z').getTime();

  it('is true for a Playing game with recorded playtime, untouched 3+ months', () => {
    const game = { status: 'playing' as const, updatedAt: '2026-01-01T00:00:00.000Z', currentPlaytimeMinutes: 300 };
    expect(suggestsDroppingStalePlaying(game, now)).toBe(true);
  });

  it('is false for a Playing game updated less than 3 months ago', () => {
    const game = { status: 'playing' as const, updatedAt: '2026-07-20T00:00:00.000Z', currentPlaytimeMinutes: 300 };
    expect(suggestsDroppingStalePlaying(game, now)).toBe(false);
  });

  it('is false when there is no recorded playtime at all (never actually started)', () => {
    const game = { status: 'playing' as const, updatedAt: '2026-01-01T00:00:00.000Z', currentPlaytimeMinutes: null };
    expect(suggestsDroppingStalePlaying(game, now)).toBe(false);
  });

  it('is false at exactly 0 minutes played', () => {
    const game = { status: 'playing' as const, updatedAt: '2026-01-01T00:00:00.000Z', currentPlaytimeMinutes: 0 };
    expect(suggestsDroppingStalePlaying(game, now)).toBe(false);
  });

  it('is false for a non-Playing status regardless of playtime/age', () => {
    const game = { status: 'backlog' as const, updatedAt: '2026-01-01T00:00:00.000Z', currentPlaytimeMinutes: 300 };
    expect(suggestsDroppingStalePlaying(game, now)).toBe(false);
  });
});

describe('computePlaytimeReviewCandidates', () => {
  it('surfaces every tracked game on a true first sync (null seen-map)', () => {
    const games = [
      makeGame({ id: 'a', currentPlaytimeMinutes: 60 }),
      makeGame({ id: 'b', currentPlaytimeMinutes: 120 }),
      makeGame({ id: 'c', currentPlaytimeMinutes: null }),
    ];
    expect(computePlaytimeReviewCandidates(games, null).map((c) => c.gameId).sort()).toEqual(['a', 'b']);
  });

  it('excludes a game whose minutes have not moved since last shown', () => {
    const games = [makeGame({ id: 'a', currentPlaytimeMinutes: 60 })];
    expect(computePlaytimeReviewCandidates(games, { a: 60 })).toEqual([]);
  });

  it('includes a game whose minutes rose past what was last shown', () => {
    const games = [makeGame({ id: 'a', currentPlaytimeMinutes: 90 })];
    expect(computePlaytimeReviewCandidates(games, { a: 60 })).toEqual([{ gameId: 'a', currentMinutes: 90 }]);
  });

  it('treats a game missing from the seen-map as never shown (0)', () => {
    const games = [makeGame({ id: 'a', currentPlaytimeMinutes: 30 })];
    expect(computePlaytimeReviewCandidates(games, {})).toEqual([{ gameId: 'a', currentMinutes: 30 }]);
  });

  it('never surfaces a game with no playtime data at all', () => {
    const games = [makeGame({ id: 'a', currentPlaytimeMinutes: null })];
    expect(computePlaytimeReviewCandidates(games, {})).toEqual([]);
    expect(computePlaytimeReviewCandidates(games, null)).toEqual([]);
  });
});
