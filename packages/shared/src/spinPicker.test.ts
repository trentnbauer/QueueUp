import { describe, it, expect } from 'vitest';
import type { Game } from './types.js';
import { hasSteamMatch, underPriceCap, spinCandidates, resolveConcreteTheme } from './spinPicker.js';

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

  it('is false without a live price, regardless of cap', () => {
    expect(underPriceCap(makeGame({ status: 'backlog' }), 15)).toBe(false);
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
