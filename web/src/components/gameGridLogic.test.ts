import { describe, it, expect } from 'vitest';
import type { Game } from '@queueup/shared';
import {
  sortByScore,
  backlogGames,
  isUnreleased,
  primaryGenre,
  lastCompletedPrimaryGenre,
  avoidedGenres,
  statusBucket,
  spinCandidateWeight,
  pickSpinWinner,
  isNeglectedBacklogGame,
  filterGames,
  distinctTagNames,
  NEGLECTED_BACKLOG_MONTHS,
  ALL_FILTER_VALUE,
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
    releaseDate: null,
    maxCoopPlayers: null,
    timeToBeatHours: null,
    ggDealsUrl: null,
    coverImageUrl: null,
    status: 'backlog',
    price: { amount: null, currency: null, source: 'unavailable', historicalLow: null, lastRefreshedAt: null },
    targetPrice: null,
    votes: [],
    myVote: null,
    voteScore: 0,
    youOwn: false,
    ownership: null,
    tags: [],
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

  it('puts a game everyone in the room owns ahead of vote score entirely', () => {
    const notOwned = makeGame({ id: 'not-owned', voteScore: 5, ownership: { owned: 1, total: 4 } });
    const fullyOwned = makeGame({ id: 'fully-owned', voteScore: 0, ownership: { owned: 4, total: 4 } });
    expect(sortByScore([notOwned, fullyOwned]).map((g) => g.id)).toEqual(['fully-owned', 'not-owned']);
  });

  it('does not treat a Personal Shelf game (ownership: null) as fully owned', () => {
    const a = makeGame({ id: 'a', voteScore: 5, ownership: null });
    const b = makeGame({ id: 'b', voteScore: 1, ownership: null });
    expect(sortByScore([a, b]).map((g) => g.id)).toEqual(['a', 'b']);
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

  it('excludes backlog games releasing in a future year', () => {
    const NOW = new Date('2026-07-01T00:00:00.000Z').getTime();
    const upcoming = makeGame({ id: 'upcoming', releaseYear: 2027 });
    const released = makeGame({ id: 'released', releaseYear: 2026 });
    expect(backlogGames([upcoming, released], NOW).map((g) => g.id)).toEqual(['released']);
  });
});

describe('isUnreleased', () => {
  const NOW = new Date('2026-07-01T00:00:00.000Z').getTime();

  it('is false for a game with no stored release year', () => {
    expect(isUnreleased(makeGame({ releaseYear: null }), NOW)).toBe(false);
  });

  it('is false for a game releasing this year or earlier', () => {
    expect(isUnreleased(makeGame({ releaseYear: 2026 }), NOW)).toBe(false);
    expect(isUnreleased(makeGame({ releaseYear: 2020 }), NOW)).toBe(false);
  });

  it('is true for a game releasing in a future year', () => {
    expect(isUnreleased(makeGame({ releaseYear: 2027 }), NOW)).toBe(true);
  });

  it('prefers releaseDate over releaseYear when both are set', () => {
    // Same year as NOW, but later in it - releaseYear alone couldn't catch this (issue #284).
    expect(
      isUnreleased(makeGame({ releaseYear: 2026, releaseDate: '2026-12-01T00:00:00.000Z' }), NOW),
    ).toBe(true);
    expect(
      isUnreleased(makeGame({ releaseYear: 2026, releaseDate: '2026-01-01T00:00:00.000Z' }), NOW),
    ).toBe(false);
  });

  it('falls back to releaseYear when releaseDate is null (games added before it existed)', () => {
    expect(isUnreleased(makeGame({ releaseYear: 2027, releaseDate: null }), NOW)).toBe(true);
    expect(isUnreleased(makeGame({ releaseYear: 2026, releaseDate: null }), NOW)).toBe(false);
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
  // voteScore=9 is used throughout so sqrt(9)=3 keeps the math exact.
  it('is sqrt(vote score) plus the unvoted baseline when there are no avoided genres', () => {
    const game = makeGame({ voteScore: 9, genre: 'Shooter' });
    expect(spinCandidateWeight(game, new Set())).toBe(4);
  });

  it('is sqrt(vote score) plus the unvoted baseline when the primary genre is in the avoided set', () => {
    const game = makeGame({ voteScore: 9, genre: 'Shooter, Adventure' });
    expect(spinCandidateWeight(game, new Set(['shooter']))).toBe(4);
  });

  it('doubles sqrt(vote score) plus the unvoted baseline when the primary genre is not in the avoided set', () => {
    const game = makeGame({ voteScore: 9, genre: 'Puzzle' });
    expect(spinCandidateWeight(game, new Set(['shooter']))).toBe(8);
  });

  it('does not boost a candidate with no genre data at all', () => {
    const game = makeGame({ voteScore: 9, genre: null });
    expect(spinCandidateWeight(game, new Set(['shooter']))).toBe(4);
  });

  it('gives an unvoted candidate a nonzero weight, not a guaranteed-loser 0', () => {
    const game = makeGame({ voteScore: 0, genre: 'Puzzle' });
    expect(spinCandidateWeight(game, new Set())).toBeGreaterThan(0);
  });

  it('does not let a heavily-voted candidate scale linearly - votes have diminishing returns', () => {
    // 16x the votes should NOT mean 16x the weight (that's what made the wheel feel rigged) -
    // sqrt keeps it to 4x (sqrt(16)=4 vs sqrt(1)=1), so a heavy favorite still isn't a lock.
    const heavy = makeGame({ voteScore: 16, genre: 'Puzzle' });
    const light = makeGame({ voteScore: 1, genre: 'Puzzle' });
    const ratio = spinCandidateWeight(heavy, new Set()) / spinCandidateWeight(light, new Set());
    expect(ratio).toBeLessThan(16);
  });
});

describe('isNeglectedBacklogGame', () => {
  const NOW = new Date('2026-07-01T00:00:00.000Z').getTime();
  const THRESHOLD = new Date('2026-04-01T00:00:00.000Z').toISOString(); // NOW minus NEGLECTED_BACKLOG_MONTHS
  const JUST_OLD_ENOUGH = new Date('2026-03-31T00:00:00.000Z').toISOString();
  const TOO_RECENT = new Date('2026-05-01T00:00:00.000Z').toISOString();

  it('uses a shorter window than Year in Review\'s fixed 12-month lookback', () => {
    // Guards the "ongoing nudge, not an annual one" intent from issue #249 - if someone bumps this
    // back up to 12 it silently turns into a second copy of the recap window instead of a
    // year-round signal.
    expect(NEGLECTED_BACKLOG_MONTHS).toBeLessThan(12);
    expect(NEGLECTED_BACKLOG_MONTHS).toBeGreaterThan(0);
  });

  it('is false for a non-backlog game, no matter how old', () => {
    const game = makeGame({ status: 'playing', createdAt: JUST_OLD_ENOUGH, updatedAt: JUST_OLD_ENOUGH });
    expect(isNeglectedBacklogGame(game, NOW)).toBe(false);
  });

  it('is false when the game was added more recently than the threshold', () => {
    const game = makeGame({ status: 'backlog', createdAt: TOO_RECENT, updatedAt: TOO_RECENT });
    expect(isNeglectedBacklogGame(game, NOW)).toBe(false);
  });

  it('is false when updatedAt (status-change proxy) is more recent than the threshold', () => {
    const game = makeGame({ status: 'backlog', createdAt: JUST_OLD_ENOUGH, updatedAt: TOO_RECENT });
    expect(isNeglectedBacklogGame(game, NOW)).toBe(false);
  });

  it('is false when a vote was cast more recently than the threshold, even if the game itself is untouched', () => {
    const game = makeGame({
      status: 'backlog',
      createdAt: JUST_OLD_ENOUGH,
      updatedAt: JUST_OLD_ENOUGH,
      votes: [{ user: { id: 'u2', displayName: 'Friend', avatarColor: '#000', avatarUrl: null, isAdmin: false }, value: 3, createdAt: TOO_RECENT }],
    });
    expect(isNeglectedBacklogGame(game, NOW)).toBe(false);
  });

  it('is true for a backlog game added and last touched at or before the threshold, with no recent votes', () => {
    const game = makeGame({ status: 'backlog', createdAt: JUST_OLD_ENOUGH, updatedAt: JUST_OLD_ENOUGH });
    expect(isNeglectedBacklogGame(game, NOW)).toBe(true);
  });

  it('treats added-exactly-at-the-threshold as old enough (N+ months, inclusive)', () => {
    const game = makeGame({ status: 'backlog', createdAt: THRESHOLD, updatedAt: THRESHOLD });
    expect(isNeglectedBacklogGame(game, NOW)).toBe(true);
  });

  it('is true when there are only old votes, none within the window', () => {
    const game = makeGame({
      status: 'backlog',
      createdAt: JUST_OLD_ENOUGH,
      updatedAt: JUST_OLD_ENOUGH,
      votes: [{ user: { id: 'u2', displayName: 'Friend', avatarColor: '#000', avatarUrl: null, isAdmin: false }, value: 3, createdAt: JUST_OLD_ENOUGH }],
    });
    expect(isNeglectedBacklogGame(game, NOW)).toBe(true);
  });
});

describe('filterGames neglectedFilter', () => {
  const NOW = new Date('2026-07-01T00:00:00.000Z').getTime();
  const OLD = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const RECENT = new Date('2026-06-25T00:00:00.000Z').toISOString();

  it('shows every game when neglectedFilter is off', () => {
    const dusty = makeGame({ id: 'dusty', status: 'backlog', createdAt: OLD, updatedAt: OLD });
    const fresh = makeGame({ id: 'fresh', status: 'backlog', createdAt: RECENT, updatedAt: RECENT });
    const result = filterGames(
      [dusty, fresh],
      { platformFilter: ALL_FILTER_VALUE, genreFilter: ALL_FILTER_VALUE, statusFilter: ALL_FILTER_VALUE, searchQuery: '', neglectedFilter: false },
      NOW,
    );
    expect(result.map((g) => g.id).sort()).toEqual(['dusty', 'fresh']);
  });

  it('shows only neglected backlog games when neglectedFilter is on', () => {
    const dusty = makeGame({ id: 'dusty', status: 'backlog', createdAt: OLD, updatedAt: OLD });
    const fresh = makeGame({ id: 'fresh', status: 'backlog', createdAt: RECENT, updatedAt: RECENT });
    const playingOld = makeGame({ id: 'playing-old', status: 'playing', createdAt: OLD, updatedAt: OLD });
    const result = filterGames(
      [dusty, fresh, playingOld],
      { platformFilter: ALL_FILTER_VALUE, genreFilter: ALL_FILTER_VALUE, statusFilter: ALL_FILTER_VALUE, searchQuery: '', neglectedFilter: true },
      NOW,
    );
    expect(result.map((g) => g.id)).toEqual(['dusty']);
  });
});

function tag(id: string, name: string) {
  return { id, name, createdAt: '2026-01-01T00:00:00.000Z' };
}

describe('distinctTagNames', () => {
  it('collects every distinct tag name across games, sorted', () => {
    const a = makeGame({ id: 'a', tags: [tag('t2', 'Short & sweet'), tag('t1', 'Co-op only')] });
    const b = makeGame({ id: 'b', tags: [tag('t1', 'Co-op only')] });
    expect(distinctTagNames([a, b])).toEqual(['Co-op only', 'Short & sweet']);
  });

  it('returns an empty array when no game has any tags', () => {
    expect(distinctTagNames([makeGame({ tags: [] })])).toEqual([]);
  });
});

describe('filterGames tagFilter', () => {
  it('shows every game when tagFilter is ALL_FILTER_VALUE (or unset)', () => {
    const tagged = makeGame({ id: 'tagged', tags: [tag('t1', 'Co-op only')] });
    const untagged = makeGame({ id: 'untagged', tags: [] });
    const result = filterGames([tagged, untagged], {
      platformFilter: ALL_FILTER_VALUE,
      genreFilter: ALL_FILTER_VALUE,
      statusFilter: ALL_FILTER_VALUE,
      searchQuery: '',
    });
    expect(result.map((g) => g.id).sort()).toEqual(['tagged', 'untagged']);
  });

  it('shows only games carrying the selected tag', () => {
    const tagged = makeGame({ id: 'tagged', tags: [tag('t1', 'Co-op only')] });
    const otherTag = makeGame({ id: 'other-tag', tags: [tag('t2', 'Short & sweet')] });
    const untagged = makeGame({ id: 'untagged', tags: [] });
    const result = filterGames([tagged, otherTag, untagged], {
      platformFilter: ALL_FILTER_VALUE,
      genreFilter: ALL_FILTER_VALUE,
      statusFilter: ALL_FILTER_VALUE,
      tagFilter: 'Co-op only',
      searchQuery: '',
    });
    expect(result.map((g) => g.id)).toEqual(['tagged']);
  });
});

describe('pickSpinWinner', () => {
  it('favors a genre-differing candidate over a higher-scored same-genre one', () => {
    // shooter: (sqrt(16)+1)*1 = 5 (same genre as avoided). puzzle: (sqrt(4)+1)*2 = 6 (differs).
    // Total = 11. roll = 0.5*11 = 5.5 -> subtract shooter's 5 -> 0.5 -> subtract puzzle's 6 -> -5.5 <= 0 -> puzzle.
    const lastCompleted = makeGame({ id: 'completed', status: 'done', genre: 'Shooter' });
    const shooter = makeGame({ id: 'shooter', genre: 'Shooter', voteScore: 16 });
    const puzzle = makeGame({ id: 'puzzle', genre: 'Puzzle', voteScore: 4 });
    const candidates = [shooter, puzzle];

    expect(pickSpinWinner([lastCompleted, ...candidates], candidates, () => 0.5)?.id).toBe('puzzle');
  });

  it('also avoids the genre of a currently-Playing game, not just the last completed one', () => {
    const playing = makeGame({ id: 'playing', status: 'playing', genre: 'Shooter' });
    const shooter = makeGame({ id: 'shooter', genre: 'Shooter', voteScore: 16 });
    const puzzle = makeGame({ id: 'puzzle', genre: 'Puzzle', voteScore: 4 });
    const candidates = [shooter, puzzle];

    // Same math as the completed-game case: puzzle's boosted weight (6) beats shooter's (5).
    expect(pickSpinWinner([playing, ...candidates], candidates, () => 0.5)?.id).toBe('puzzle');
  });

  it('falls back to plain vote-score weighting when nothing has been completed or is playing', () => {
    // shooter: (sqrt(16)+1)*1 = 5. puzzle: (sqrt(4)+1)*1 = 3. Total = 8. roll = 0.5*8 = 4 ->
    // subtract shooter's 5 -> -1 <= 0 -> shooter, confirming no boost applies with nothing to avoid.
    const shooter = makeGame({ id: 'shooter', genre: 'Shooter', voteScore: 16 });
    const puzzle = makeGame({ id: 'puzzle', genre: 'Puzzle', voteScore: 4 });
    const candidates = [shooter, puzzle];
    expect(pickSpinWinner(candidates, candidates, () => 0.5)?.id).toBe('shooter');
  });

  it('gives an unvoted candidate a real chance instead of a guaranteed loss to any voted one', () => {
    // unvoted: (sqrt(0)+1)*1 = 1. voted: (sqrt(9)+1)*1 = 4. Total = 5. A roll near the very top
    // (0.99) still lands on the unvoted candidate - impossible before the baseline weight existed,
    // since its weight was exactly 0.
    const unvoted = makeGame({ id: 'unvoted', genre: 'Puzzle', voteScore: 0 });
    const voted = makeGame({ id: 'voted', genre: 'Puzzle', voteScore: 9 });
    const candidates = [voted, unvoted];
    expect(pickSpinWinner(candidates, candidates, () => 0.99)?.id).toBe('unvoted');
  });

  it('returns null for an empty candidate list', () => {
    expect(pickSpinWinner([], [], () => 0.5)).toBeNull();
  });
});
