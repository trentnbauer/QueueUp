import { describe, it, expect } from 'vitest';
import type { Game } from '@queueup/shared';
import { formatPrice, ggDealsSearchUrl } from './formatPrice';

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

describe('formatPrice', () => {
  it('shows the live price when one is available (issue #385 fallback stays out of the way)', () => {
    const game = makeGame({
      price: { amount: '19.99', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null },
      manualPrice: '25.00',
    });
    expect(formatPrice(game)).toBe('$19.99');
  });

  it('falls back to the manual price, marked with "~", when there is no live amount (issue #385)', () => {
    const game = makeGame({ manualPrice: '12' });
    expect(formatPrice(game)).toBe('~$12.00');
  });

  it('shows a free ($0.00) manual price rather than falling through to "—" (issue #425)', () => {
    const game = makeGame({ manualPrice: '0.00' });
    expect(formatPrice(game)).toBe('~$0.00');
  });

  it('shows "—" when neither a live nor a manual price is available', () => {
    expect(formatPrice(makeGame())).toBe('—');
  });
});

describe('ggDealsSearchUrl', () => {
  it('URL-encodes special characters in the title (issue #336)', () => {
    expect(ggDealsSearchUrl('Wolfenstein: The Old Blood')).toBe(
      'https://gg.deals/search/?title=Wolfenstein%3A%20The%20Old%20Blood',
    );
  });

  it('leaves a plain title readable in the query string', () => {
    expect(ggDealsSearchUrl('Hades')).toBe('https://gg.deals/search/?title=Hades');
  });
});
