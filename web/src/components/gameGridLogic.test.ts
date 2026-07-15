import { describe, it, expect } from 'vitest';
import type { Game } from '@squadqueue/shared';
import {
  sortByScore,
  playNextGames,
  primaryGenre,
  recommendedNextId,
  statusBucket,
  pickWeightedRandom,
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
    price: { amount: null, currency: null, source: 'unavailable', historicalLow: null },
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

describe('playNextGames', () => {
  it('excludes unvoted games (score 0)', () => {
    const voted = makeGame({ id: 'voted', voteScore: 3 });
    const unvoted = makeGame({ id: 'unvoted', voteScore: 0 });
    expect(playNextGames([voted, unvoted]).map((g) => g.id)).toEqual(['voted']);
  });

  it('excludes non-backlog games even if voted', () => {
    const playing = makeGame({ id: 'playing', status: 'playing', voteScore: 5 });
    const done = makeGame({ id: 'done', status: 'done', voteScore: 5 });
    const backlog = makeGame({ id: 'backlog', status: 'backlog', voteScore: 5 });
    expect(playNextGames([playing, done, backlog]).map((g) => g.id)).toEqual(['backlog']);
  });

  it('caps at 3, highest scores first', () => {
    const games = [1, 2, 3, 4, 5].map((score) => makeGame({ id: `g${score}`, voteScore: score }));
    expect(playNextGames(games).map((g) => g.id)).toEqual(['g5', 'g4', 'g3']);
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

describe('recommendedNextId', () => {
  it('picks the play-next candidate whose primary genre differs from the last completed game', () => {
    // Matches the exact scenario from the issue: last completed a shooter, play-next candidates
    // shooter/shooter/puzzle -> recommend the puzzle one.
    const lastCompleted = makeGame({
      id: 'completed',
      status: 'done',
      genre: 'Shooter',
      updatedAt: '2026-01-05T00:00:00.000Z',
    });
    const shooter1 = makeGame({ id: 'shooter1', genre: 'Shooter', voteScore: 5 });
    const shooter2 = makeGame({ id: 'shooter2', genre: 'Shooter', voteScore: 4 });
    const puzzle = makeGame({ id: 'puzzle', genre: 'Puzzle, Adventure', voteScore: 3 });
    const candidates = [shooter1, shooter2, puzzle];

    expect(recommendedNextId([lastCompleted, ...candidates], candidates)).toBe('puzzle');
  });

  it('does not flag a shared secondary genre as "different" (real bug this caught)', () => {
    // A puzzle-platformer and a shooter both tagged "Adventure" as a secondary genre should still
    // be treated as different, since only the *primary* genre is compared.
    const lastCompleted = makeGame({ id: 'completed', status: 'done', genre: 'Shooter, Adventure' });
    const differentPrimary = makeGame({ id: 'differs', genre: 'Platform, Adventure', voteScore: 5 });
    expect(recommendedNextId([lastCompleted, differentPrimary], [differentPrimary])).toBe('differs');
  });

  it('returns null when nothing has been completed yet', () => {
    const candidate = makeGame({ id: 'c1', genre: 'Puzzle' });
    expect(recommendedNextId([candidate], [candidate])).toBeNull();
  });

  it('returns null when every candidate shares the primary genre with the last completed game', () => {
    const lastCompleted = makeGame({ id: 'completed', status: 'done', genre: 'Shooter' });
    const alsoShooter = makeGame({ id: 'shooter', genre: 'Shooter, Action' });
    expect(recommendedNextId([lastCompleted, alsoShooter], [alsoShooter])).toBeNull();
  });

  it('returns null when the last completed game has no genre data', () => {
    const lastCompleted = makeGame({ id: 'completed', status: 'done', genre: null });
    const candidate = makeGame({ id: 'c1', genre: 'Puzzle' });
    expect(recommendedNextId([lastCompleted, candidate], [candidate])).toBeNull();
  });

  it('uses the most recently completed game when several exist', () => {
    const olderCompleted = makeGame({
      id: 'older',
      status: 'done',
      genre: 'Puzzle',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const newerCompleted = makeGame({
      id: 'newer',
      status: 'done',
      genre: 'Shooter',
      updatedAt: '2026-01-10T00:00:00.000Z',
    });
    const puzzleCandidate = makeGame({ id: 'candidate', genre: 'Puzzle' });
    // Newer completed game is a Shooter, so the Puzzle candidate should still be recommended -
    // if it wrongly used the *older* completed game (also Puzzle), this would return null instead.
    expect(recommendedNextId([olderCompleted, newerCompleted, puzzleCandidate], [puzzleCandidate])).toBe(
      'candidate',
    );
  });
});

describe('statusBucket', () => {
  it('orders playing < play-next backlog < other backlog < done', () => {
    const playNext = new Set(['pn']);
    const playing = makeGame({ id: 'p', status: 'playing' });
    const playNextBacklog = makeGame({ id: 'pn', status: 'backlog' });
    const plainBacklog = makeGame({ id: 'b', status: 'backlog' });
    const done = makeGame({ id: 'd', status: 'done' });

    expect(statusBucket(playing, playNext)).toBeLessThan(statusBucket(playNextBacklog, playNext));
    expect(statusBucket(playNextBacklog, playNext)).toBeLessThan(statusBucket(plainBacklog, playNext));
    expect(statusBucket(plainBacklog, playNext)).toBeLessThan(statusBucket(done, playNext));
  });
});

describe('pickWeightedRandom', () => {
  it('returns null for an empty candidate list', () => {
    expect(pickWeightedRandom([], () => 0.5)).toBeNull();
  });

  it('returns the only candidate when there is just one', () => {
    const only = makeGame({ id: 'only', voteScore: 3 });
    expect(pickWeightedRandom([only], () => 0.5)?.id).toBe('only');
  });

  it('picks proportionally to vote score using the injected random source', () => {
    // weights [1, 3] -> total 4. roll = random() * 4.
    const low = makeGame({ id: 'low', voteScore: 1 });
    const high = makeGame({ id: 'high', voteScore: 3 });
    const candidates = [low, high];

    // roll = 0.99*4 = 3.96 -> subtract low's weight (1) -> 2.96, subtract high's weight (3) -> -0.04 <= 0 -> high
    expect(pickWeightedRandom(candidates, () => 0.99)?.id).toBe('high');
    // roll = 0.1*4 = 0.4 -> subtract low's weight (1) -> -0.6 <= 0 -> low
    expect(pickWeightedRandom(candidates, () => 0.1)?.id).toBe('low');
  });

  it('falls back to a uniform pick when every candidate has zero weight', () => {
    const a = makeGame({ id: 'a', voteScore: 0 });
    const b = makeGame({ id: 'b', voteScore: 0 });
    // random()=0.6 over 2 candidates -> index floor(0.6*2)=1 -> b
    expect(pickWeightedRandom([a, b], () => 0.6)?.id).toBe('b');
  });
});
