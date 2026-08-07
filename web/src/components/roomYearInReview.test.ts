import { describe, it, expect } from 'vitest';
import type { Game } from '@queueup/shared';
import { computeRoomYearInReview } from './roomYearInReview';

const NOW = new Date('2026-07-01T00:00:00.000Z').getTime();
const IN_WINDOW = '2026-01-01T00:00:00.000Z';
const OUT_OF_WINDOW = '2024-01-01T00:00:00.000Z';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    roomId: 'room1',
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

describe('computeRoomYearInReview', () => {
  it('includes only Done games updated within the trailing 12-month window', () => {
    const recent = makeGame({ id: 'recent', status: 'done', updatedAt: IN_WINDOW });
    const stale = makeGame({ id: 'stale', status: 'done', updatedAt: OUT_OF_WINDOW });
    const backlog = makeGame({ id: 'backlog', status: 'backlog', updatedAt: IN_WINDOW });
    const result = computeRoomYearInReview([recent, stale, backlog], NOW);
    expect(result.completedGames.map((g) => g.id)).toEqual(['recent']);
  });

  it('tallies genre spread across completed games, highest first', () => {
    const a = makeGame({ id: 'a', status: 'done', updatedAt: IN_WINDOW, genre: 'RPG' });
    const b = makeGame({ id: 'b', status: 'done', updatedAt: IN_WINDOW, genre: 'RPG' });
    const c = makeGame({ id: 'c', status: 'done', updatedAt: IN_WINDOW, genre: 'Shooter' });
    const result = computeRoomYearInReview([a, b, c], NOW);
    expect(result.genreSpread).toEqual([
      { genre: 'RPG', count: 2 },
      { genre: 'Shooter', count: 1 },
    ]);
  });

  it('omits completed games with no genre on file from genreSpread', () => {
    const noGenre = makeGame({ id: 'a', status: 'done', updatedAt: IN_WINDOW, genre: null });
    const result = computeRoomYearInReview([noGenre], NOW);
    expect(result.genreSpread).toEqual([]);
  });

  it('picks the game with the most vote weight cast within the window, regardless of status', () => {
    const low = makeGame({
      id: 'low',
      votes: [{ user: { id: 'u2', displayName: 'Friend', avatarColor: '#000', avatarUrl: null, isAdmin: false }, value: 1, createdAt: IN_WINDOW }],
    });
    const high = makeGame({
      id: 'high',
      votes: [{ user: { id: 'u2', displayName: 'Friend', avatarColor: '#000', avatarUrl: null, isAdmin: false }, value: 3, createdAt: IN_WINDOW }],
    });
    const result = computeRoomYearInReview([low, high], NOW);
    expect(result.topVoted?.id).toBe('high');
    expect(result.topVoted?.voteScore).toBe(3);
  });

  it('ignores votes cast outside the window when scoring topVoted', () => {
    const game = makeGame({
      id: 'g',
      votes: [{ user: { id: 'u2', displayName: 'Friend', avatarColor: '#000', avatarUrl: null, isAdmin: false }, value: 5, createdAt: OUT_OF_WINDOW }],
    });
    const result = computeRoomYearInReview([game], NOW);
    expect(result.topVoted).toBeNull();
  });

  it('is null for topVoted when nothing has any votes', () => {
    const result = computeRoomYearInReview([makeGame()], NOW);
    expect(result.topVoted).toBeNull();
  });

  describe('windowStart on a leap day (issue #527)', () => {
    const LEAP_DAY_NOW = new Date('2024-02-29T12:00:00.000Z').getTime();

    it('lands on Feb 28 of the prior (non-leap) year rather than overflowing to March 1', () => {
      const result = computeRoomYearInReview([], LEAP_DAY_NOW);
      expect(result.windowStart).toBe('2023-02-28T12:00:00.000Z');
    });

    it('does not drop a game updated on Feb 28 of the prior year from the window', () => {
      const edgeCase = makeGame({ id: 'edge', status: 'done', updatedAt: '2023-02-28T12:00:00.000Z' });
      const result = computeRoomYearInReview([edgeCase], LEAP_DAY_NOW);
      expect(result.completedGames.map((g) => g.id)).toEqual(['edge']);
    });
  });
});
