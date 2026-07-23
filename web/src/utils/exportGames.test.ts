import { describe, it, expect } from 'vitest';
import type { Game } from '@queueup/shared';
import { toCsv, toJson } from './exportGames';

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
    votes: [],
    myVote: null,
    voteScore: 0,
    youOwn: false,
    ownership: null,
    tags: [],
    igdbCollectionId: null,
    reviewScore: null,
    prerequisiteGameId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toCsv', () => {
  it('includes a header row and one row per game', () => {
    const games = [makeGame({ title: 'Alpha' }), makeGame({ id: 'g2', title: 'Beta' })];
    const lines = toCsv(games).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Title,Platform,Genre,Status,Price,Votes,Added By,Added At');
    expect(lines[1]).toContain('Alpha');
    expect(lines[2]).toContain('Beta');
  });

  it('quotes and escapes fields containing commas or quotes', () => {
    const game = makeGame({ title: 'Snake, Rattle & Roll "Classic"' });
    const csv = toCsv([game]);
    expect(csv).toContain('"Snake, Rattle & Roll ""Classic"""');
  });

  it('formats price as amount + currency when available', () => {
    const game = makeGame({ price: { amount: '19.99', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null } });
    expect(toCsv([game])).toContain('19.99 USD');
  });
});

describe('toJson', () => {
  it('serializes the expected fields', () => {
    const game = makeGame({ title: 'Alpha', voteScore: 7, genre: 'RPG' });
    const parsed = JSON.parse(toJson([game]));
    expect(parsed).toEqual([
      {
        title: 'Alpha',
        platform: 'PC',
        genre: 'RPG',
        status: 'backlog',
        price: null,
        voteScore: 7,
        addedBy: 'Dev',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('includes a price object only when a price is available', () => {
    const game = makeGame({ price: { amount: '9.99', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null } });
    const parsed = JSON.parse(toJson([game]));
    expect(parsed[0].price).toEqual({ amount: '9.99', currency: 'USD' });
  });
});
