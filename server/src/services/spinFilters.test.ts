import { describe, expect, it } from 'vitest';
import type { Game } from '@queueup/shared';
import { applySpinFilters, parseSpinFilters } from './spinFilters.js';

function game(over: Partial<Game> & { id: string }): Game {
  return {
    youOwn: false,
    timeToBeatHours: null,
    ownership: null,
    price: { amount: null, currency: null, source: 'unavailable', historicalLow: null, lastRefreshedAt: null },
    ...over,
  } as Game;
}

describe('parseSpinFilters', () => {
  it('keeps positive numbers and an explicit true', () => {
    expect(parseSpinFilters({ maxPrice: 20, maxTtb: 10, everyoneOwns: true })).toEqual({ maxPrice: 20, maxTtb: 10, everyoneOwns: true });
  });

  it('drops anything else', () => {
    expect(parseSpinFilters({ maxPrice: '20', maxTtb: -5, everyoneOwns: 'yes' })).toEqual({ maxPrice: undefined, maxTtb: undefined, everyoneOwns: false });
    expect(parseSpinFilters(undefined)).toEqual({ maxPrice: undefined, maxTtb: undefined, everyoneOwns: false });
  });
});

describe('applySpinFilters', () => {
  const cheap = game({ id: 'cheap', price: { amount: '9.99', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null } as Game['price'] });
  const dear = game({ id: 'dear', price: { amount: '59.99', currency: 'USD', source: 'live', historicalLow: null, lastRefreshedAt: null } as Game['price'] });
  const owned = game({ id: 'owned', youOwn: true });
  const unpriced = game({ id: 'unpriced' });
  const all = [cheap, dear, owned, unpriced];

  it('passes everything through with no filters', () => {
    expect(applySpinFilters(all, {})).toHaveLength(4);
  });

  it('price limit keeps owned and cheap games, drops dear and unpriced ones', () => {
    expect(applySpinFilters(all, { maxPrice: 20 }).map((g) => g.id)).toEqual(['cheap', 'owned']);
  });

  it('length limit drops games with no time to beat', () => {
    const short = game({ id: 'short', timeToBeatHours: 8 });
    const long = game({ id: 'long', timeToBeatHours: 60 });
    expect(applySpinFilters([short, long, unpriced], { maxTtb: 10 }).map((g) => g.id)).toEqual(['short']);
  });

  it('everyone-owns needs a full ownership count', () => {
    const everyone = game({ id: 'everyone', ownership: { owned: 4, total: 4 } as Game['ownership'] });
    const some = game({ id: 'some', ownership: { owned: 2, total: 4 } as Game['ownership'] });
    expect(applySpinFilters([everyone, some, unpriced], { everyoneOwns: true }).map((g) => g.id)).toEqual(['everyone']);
  });
});
