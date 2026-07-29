import { describe, it, expect } from 'vitest';
import type { Game } from './types.js';
import { hasSteamMatch, underPriceCap, spinCandidates, resolveConcreteTheme, buildSpinStrip } from './spinPicker.js';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    roomId: 'r1',
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

describe('hasSteamMatch', () => {
  it('is true for a live-priced game', () => {
    expect(hasSteamMatch(makeGame({ price: { amount: '9.99', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null } }))).toBe(true);
  });

  it('is true for a resolved gg.deals URL even without a live price', () => {
    expect(hasSteamMatch(makeGame({ ggDealsUrl: 'https://gg.deals/x' }))).toBe(true);
  });

  it('is false with neither', () => {
    expect(hasSteamMatch(makeGame())).toBe(false);
  });
});

describe('underPriceCap', () => {
  it('is false when no threshold is set (Personal Shelf)', () => {
    const game = makeGame({ price: { amount: '5', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null } });
    expect(underPriceCap(game, undefined)).toBe(false);
  });

  it('is true at or under the cap on a live price', () => {
    const game = makeGame({ price: { amount: '15', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null } });
    expect(underPriceCap(game, 15)).toBe(true);
  });

  it('is false over the cap', () => {
    const game = makeGame({ price: { amount: '20', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null } });
    expect(underPriceCap(game, 15)).toBe(false);
  });

  it('is false without a live price or manual price, regardless of cap', () => {
    expect(underPriceCap(makeGame({ status: 'backlog' }), 15)).toBe(false);
  });

  it('falls back to the manual price when there is no live price (issue #443)', () => {
    expect(underPriceCap(makeGame({ manualPrice: '0' }), 15)).toBe(true);
    expect(underPriceCap(makeGame({ manualPrice: '10' }), 15)).toBe(true);
    expect(underPriceCap(makeGame({ manualPrice: '20' }), 15)).toBe(false);
  });

  it('prefers the live price over the manual price when both are set', () => {
    const game = makeGame({
      price: { amount: '20', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null },
      manualPrice: '5',
    });
    expect(underPriceCap(game, 15)).toBe(false);
  });
});

describe('spinCandidates', () => {
  it('is the full backlog when no ownership threshold is set', () => {
    const games = [makeGame({ id: 'a', status: 'backlog' }), makeGame({ id: 'b', status: 'wishlist' })];
    expect(spinCandidates(games, undefined).map((g) => g.id)).toEqual(['a']);
  });

  it('narrows to fully-owned-or-under-cap games once a threshold is set', () => {
    const owned = makeGame({ id: 'owned', status: 'backlog', ownership: { owned: 2, total: 2 } });
    const cheap = makeGame({
      id: 'cheap',
      status: 'backlog',
      ownership: { owned: 0, total: 2 },
      price: { amount: '10', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null },
    });
    const tooExpensive = makeGame({
      id: 'expensive',
      status: 'backlog',
      ownership: { owned: 0, total: 2 },
      price: { amount: '50', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null },
    });
    const games = [owned, cheap, tooExpensive];
    expect(spinCandidates(games, 15).map((g) => g.id).sort()).toEqual(['cheap', 'owned']);
  });

  it('includes a not-fully-owned free game whose only price is a manual $0 entry (issue #443)', () => {
    const free = makeGame({
      id: 'free',
      status: 'backlog',
      ownership: { owned: 0, total: 2 },
      manualPrice: '0',
    });
    expect(spinCandidates([free], 15).map((g) => g.id)).toEqual(['free']);
  });
});

describe('resolveConcreteTheme', () => {
  it('passes a concrete theme through unchanged', () => {
    expect(resolveConcreteTheme('roulette')).toBe('roulette');
  });

  it('resolves "random" deterministically from an injected random()', () => {
    expect(resolveConcreteTheme('random', () => 0)).toBe('slot');
    expect(resolveConcreteTheme('random', () => 0.99)).toBe('roulette');
  });
});

describe('buildSpinStrip', () => {
  it('is empty when there are no candidates', () => {
    expect(buildSpinStrip([], [])).toEqual([]);
  });

  it('produces exactly `length` slots, every one drawn from the candidate pool', () => {
    const a = makeGame({ id: 'a' });
    const b = makeGame({ id: 'b' });
    const strip = buildSpinStrip([a, b], [a, b], () => 0.5, 10);
    expect(strip).toHaveLength(10);
    expect(strip.every((g) => g.id === 'a' || g.id === 'b')).toBe(true);
  });

  it('repeats the only candidate to fill every slot when there is just one', () => {
    const only = makeGame({ id: 'only' });
    const strip = buildSpinStrip([only], [only], Math.random, 8);
    expect(strip).toHaveLength(8);
    expect(strip.every((g) => g.id === 'only')).toBe(true);
  });

  it('a higher-voted candidate occupies more of the strip (weighted density, not a single pick)', () => {
    const popular = makeGame({ id: 'popular', voteScore: 25 });
    const unvoted = makeGame({ id: 'unvoted', voteScore: 0 });
    // Deterministic sequential random() sweeping 0..1 - stands in for a real distribution so the
    // resulting mix reflects the weighting instead of one arbitrary draw.
    let i = 0;
    const N = 1000;
    const sequential = () => i++ / N;
    const strip = buildSpinStrip([popular, unvoted], [popular, unvoted], sequential, N);
    const popularCount = strip.filter((g) => g.id === 'popular').length;
    expect(popularCount).toBeGreaterThan(N / 2);
  });
});
