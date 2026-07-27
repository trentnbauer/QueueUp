import { describe, it, expect } from 'vitest';
import type { Game } from '@queueup/shared';
import { buildWheel } from './RouletteTheme';

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
    tags: [],
    igdbCollectionId: null,
    reviewScore: null,
    prerequisiteGameId: null,
    baseGameId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Fisher-Yates swaps pool[i] with pool[Math.floor(random() * (i+1))] - a value just under 1 makes
// that index resolve to `i` itself for every iteration (for these small test arrays), so the
// shuffle is a true no-op and segment order matches input order. Assertions below mostly look
// segments up by game id rather than array position, so they'd pass regardless - but keeping the
// shuffle actually inert makes the "tiles the full circle in order" test meaningful.
const noShuffle = () => 0.999;

describe('buildWheel (issue #355)', () => {
  it('sizes each slice proportionally to its weight', () => {
    const a = makeGame({ id: 'a' });
    const b = makeGame({ id: 'b' });
    const weights = new Map([
      ['a', 3],
      ['b', 1],
    ]);

    const { segments } = buildWheel([a, b], a, weights, noShuffle);

    const segA = segments.find((s) => s.game.id === 'a')!;
    const segB = segments.find((s) => s.game.id === 'b')!;
    expect(segA.arcAngle).toBeCloseTo(270);
    expect(segB.arcAngle).toBeCloseTo(90);
  });

  it('splits evenly when every candidate has the same weight', () => {
    const games = ['a', 'b', 'c', 'd'].map((id) => makeGame({ id }));
    const weights = new Map(games.map((g) => [g.id, 1]));

    const { segments } = buildWheel(games, games[0], weights, noShuffle);

    for (const seg of segments) {
      expect(seg.arcAngle).toBeCloseTo(90);
    }
  });

  it('segments tile the full circle with no gaps or overlaps', () => {
    const games = ['a', 'b', 'c'].map((id) => makeGame({ id }));
    const weights = new Map([
      ['a', 5],
      ['b', 2],
      ['c', 1],
    ]);

    const { segments } = buildWheel(games, games[0], weights, noShuffle);

    let expectedStart = 0;
    for (const seg of segments) {
      expect(seg.startAngle).toBeCloseTo(expectedStart);
      expectedStart += seg.arcAngle;
    }
    expect(expectedStart).toBeCloseTo(360);
  });

  it('force-includes the winner when truncating a large candidate pool', () => {
    // 20 candidates, winner weighted lowest - it would be sorted last and truncated away by
    // MAX_WHEEL_SEGMENTS (16) if it weren't force-included.
    const games = Array.from({ length: 20 }, (_, i) => makeGame({ id: `g${i}` }));
    const winner = games[19];
    const weights = new Map(games.map((g, i) => [g.id, 20 - i]));
    weights.set(winner.id, 0.1);

    const { segments, winnerSegmentIndex } = buildWheel(games, winner, weights, noShuffle);

    expect(segments.length).toBeLessThanOrEqual(16);
    expect(winnerSegmentIndex).toBeGreaterThanOrEqual(0);
    expect(segments[winnerSegmentIndex].game.id).toBe(winner.id);
  });

  it('falls back to weight 1 for a candidate missing from the weights map', () => {
    const a = makeGame({ id: 'a' });
    const b = makeGame({ id: 'b' });
    const weights = new Map([['a', 1]]); // b intentionally missing

    const { segments } = buildWheel([a, b], a, weights, noShuffle);

    const segB = segments.find((s) => s.game.id === 'b')!;
    expect(segB.arcAngle).toBeCloseTo(180);
  });

  it('always has a segment for a single-candidate wheel spanning the full circle', () => {
    const only = makeGame({ id: 'only' });
    const { segments, winnerSegmentIndex } = buildWheel([only], only, new Map([['only', 1]]), noShuffle);

    expect(segments).toHaveLength(1);
    expect(segments[0].arcAngle).toBeCloseTo(360);
    expect(winnerSegmentIndex).toBe(0);
  });
});
