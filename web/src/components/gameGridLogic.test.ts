import { describe, it, expect } from 'vitest';
import type { Game } from '@squadqueue/shared';
import {
  sortByScore,
  backlogGames,
  primaryGenre,
  lastCompletedPrimaryGenre,
  avoidedGenres,
  statusBucket,
  spinCandidateWeight,
  pickSpinWinner,
} from './gameGridLogic';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    roomId: null,
    addedBy: { id: 'u1', displayName: 'Dev', avatarColor: '#fff', avatarUrl: null, isAdmin: false },
    title: 'Test Game',
    platform: 'PC',
    genre: null,
    releaseYear: null,
    maxCoopPlayers: null,
    ggDealsUrl: null,
    coverImageUrl: null,
    status: 'backlog',
    price: { amount: null, currency: null, source: 'unavailable', historicalLow: null, lastRefreshedAt: null },
    votes: [],
    myVote: null,
    voteScore: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('sortByScore', () => {
  it('sorts by voteScore descending', () => {
    const a = makeGame({ id: 'a', voteScore: 1 });
    const b = makeGame({ id: 'b', voteScore: 5 });
    const c = makeGame({ id: 'c', voteScore: 3 });
    expect(sortByScore([a, b, c]).map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by newest createdAt first', () => {
    const older = makeGame({ id: 'older', voteScore: 2, createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeGame({ id: 'newer', voteScore: 2, createdAt: '2026-01-02T00:00:00.000Z' });
    expect(sortByScore([older, newer]).map((g) => g.id)).toEqual(['newer', 'older']);
  });
});

describe('backlogGames', () => {
  it('includes every backlog game regardless of vote count', () => {
    const voted = makeGame({ id: 'voted', voteScore: 3 });
    const unvoted = makeGame({ id: 'unvoted', voteScore: 0 });
    expect(backlogGames([voted, unvoted]).map((g) => g.id).sort()).toEqual(['unvoted', 'voted']);
  });

  it('excludes non-backlog games', () => {
    const playing = makeGame({ id: 'playing', status: 'playing', voteScore: 5 });
    const done = makeGame({ id: 'done', status: 'done', voteScore: 5 });
    const backlog = makeGame({ id: 'backlog', status: 'backlog', voteScore: 5 });
    expect(backlogGames([playing, done, backlog]).map((g) => g.id)).toEqual(['backlog']);
  });
});

describe('primaryGenre', () => {
  it('takes the first comma-separated tag, lowercased', () => {
    expect(primaryGenre('Shooter, Adventure')).toBe('shooter');
  });

  it('returns null for null/empty genre', () => {
    expect(primaryGenre(null)).toBeNull();
    expect(primaryGenre('')).toBeNull();
  });
});

describe('lastCompletedPrimaryGenre', () => {
  it('returns null when nothing has been completed yet', () => {
    expect(lastCompletedPrimaryGenre([makeGame({ status: 'backlog' })])).toBeNull();
  });

  it('returns null when the last completed game has no genre data', () => {
    expect(lastCompletedPrimaryGenre([makeGame({ status: 'done', genre: null })])).toBeNull();
  });

  it('uses the most recently completed game when several exist', () => {
    const older = makeGame({ id: 'older', status: 'done', genre: 'Puzzle', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeGame({ id: 'newer', status: 'done', genre: 'Shooter', updatedAt: '2026-01-10T00:00:00.000Z' });
    expect(lastCompletedPrimaryGenre([older, newer])).toBe('shooter');
  });
});

describe('avoidedGenres', () => {
  it('is empty when nothing is completed or currently playing', () => {
    expect(avoidedGenres([makeGame({ status: 'backlog', genre: 'Puzzle' })]).size).toBe(0);
  });

  it('includes the last completed game\'s primary genre', () => {
    const completed = makeGame({ status: 'done', genre: 'Shooter, Adventure' });
    expect(avoidedGenres([completed])).toEqual(new Set(['shooter']));
  });

  it('includes every currently-Playing game\'s primary genre, not just one', () => {
    const playing1 = makeGame({ id: 'p1', status: 'playing', genre: 'Shooter' });
    const playing2 = makeGame({ id: 'p2', status: 'playing', genre: 'Puzzle' });
    expect(avoidedGenres([playing1, playing2])).toEqual(new Set(['shooter', 'puzzle']));
  });

  it('combines the last completed game with currently-Playing games', () => {
    const completed = makeGame({ id: 'c', status: 'done', genre: 'RPG' });
    const playing = makeGame({ id: 'p', status: 'playing', genre: 'Shooter' });
    expect(avoidedGenres([completed, playing])).toEqual(new Set(['rpg', 'shooter']));
  });
});

describe('statusBucket', () => {
  it('orders playing < backlog < done', () => {
    const playing = makeGame({ status: 'playing' });
    const backlog = makeGame({ status: 'backlog' });
    const done = makeGame({ status: 'done' });

    expect(statusBucket(playing)).toBeLessThan(statusBucket(backlog));
    expect(statusBucket(backlog)).toBeLessThan(statusBucket(done));
  });
});

describe('spinCandidateWeight', () => {
  it('is just the vote score when there are no avoided genres', () => {
    const game = makeGame({ voteScore: 3, genre: 'Shooter' });
    expect(spinCandidateWeight(game, new Set())).toBe(3);
  });

  it('is just the vote score when the primary genre is in the avoided set', () => {
    const game = makeGame({ voteScore: 3, genre: 'Shooter, Adventure' });
    expect(spinCandidateWeight(game, new Set(['shooter']))).toBe(3);
  });

  it('doubles the vote score when the primary genre is not in the avoided set', () => {
    const game = makeGame({ voteScore: 3, genre: 'Puzzle' });
    expect(spinCandidateWeight(game, new Set(['shooter']))).toBe(6);
  });

  it('does not boost a candidate with no genre data at all', () => {
    const game = makeGame({ voteScore: 3, genre: null });
    expect(spinCandidateWeight(game, new Set(['shooter']))).toBe(3);
  });
});

describe('pickSpinWinner', () => {
  it('favors a genre-differing candidate over a higher-scored same-genre one', () => {
    // Without the genre boost, "shooter" (score 5) would dominate "puzzle" (score 3) at this roll.
    // With the boost, puzzle's effective weight (6) exceeds shooter's (5), flipping the outcome.
    const lastCompleted = makeGame({ id: 'completed', status: 'done', genre: 'Shooter' });
    const shooter = makeGame({ id: 'shooter', genre: 'Shooter', voteScore: 5 });
    const puzzle = makeGame({ id: 'puzzle', genre: 'Puzzle', voteScore: 3 });
    const candidates = [shooter, puzzle];

    // Total effective weight = 5 + 6 = 11. roll = 0.5*11 = 5.5 -> subtract shooter's 5 -> 0.5 -> subtract puzzle's 6 -> -5.5 <= 0 -> puzzle.
    expect(pickSpinWinner([lastCompleted, ...candidates], candidates, () => 0.5)?.id).toBe('puzzle');
  });

  it('also avoids the genre of a currently-Playing game, not just the last completed one', () => {
    const playing = makeGame({ id: 'playing', status: 'playing', genre: 'Shooter' });
    const shooter = makeGame({ id: 'shooter', genre: 'Shooter', voteScore: 5 });
    const puzzle = makeGame({ id: 'puzzle', genre: 'Puzzle', voteScore: 3 });
    const candidates = [shooter, puzzle];

    // Same math as the completed-game case: puzzle's boosted weight (6) beats shooter's (5).
    expect(pickSpinWinner([playing, ...candidates], candidates, () => 0.5)?.id).toBe('puzzle');
  });

  it('falls back to plain vote-score weighting when nothing has been completed or is playing', () => {
    const shooter = makeGame({ id: 'shooter', genre: 'Shooter', voteScore: 5 });
    const puzzle = makeGame({ id: 'puzzle', genre: 'Puzzle', voteScore: 3 });
    const candidates = [shooter, puzzle];
    // Total weight = 8 (no boost). roll = 0.5*8 = 4 -> subtract shooter's 5 -> -1 <= 0 -> shooter,
    // confirming no boost is applied even though puzzle's genre "differs" from nothing in particular.
    expect(pickSpinWinner(candidates, candidates, () => 0.5)?.id).toBe('shooter');
  });

  it('returns null for an empty candidate list', () => {
    expect(pickSpinWinner([], [], () => 0.5)).toBeNull();
  });
});
