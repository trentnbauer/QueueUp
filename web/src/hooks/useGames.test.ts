import { describe, it, expect } from 'vitest';
import type { Query } from '@tanstack/react-query';
import { isSameGamesList } from './useGames';

function fakeQuery(queryKey: unknown[]): Query {
  return { queryKey } as unknown as Query;
}

describe('isSameGamesList', () => {
  const region = 'US';

  it('matches the personal shelf list itself', () => {
    expect(isSameGamesList(fakeQuery(['games', 'shelf', region]), null)).toBe(true);
  });

  it('matches the personal shelf search variant, not just the plain list', () => {
    expect(isSameGamesList(fakeQuery(['games', 'shelf-search', region, 'zelda']), null)).toBe(true);
  });

  it('matches a room list itself', () => {
    expect(isSameGamesList(fakeQuery(['games', 'room', 'room-1', region]), 'room-1')).toBe(true);
  });

  it('matches that same room search variant, despite the extra "search" segment before region', () => {
    expect(isSameGamesList(fakeQuery(['games', 'room', 'room-1', 'search', region, 'zelda']), 'room-1')).toBe(true);
  });

  it('does not match a different room', () => {
    expect(isSameGamesList(fakeQuery(['games', 'room', 'room-2', region]), 'room-1')).toBe(false);
    expect(isSameGamesList(fakeQuery(['games', 'room', 'room-2', 'search', region, 'zelda']), 'room-1')).toBe(false);
  });

  it('does not match the personal shelf when scoped to a room, or vice versa', () => {
    expect(isSameGamesList(fakeQuery(['games', 'shelf', region]), 'room-1')).toBe(false);
    expect(isSameGamesList(fakeQuery(['games', 'room', 'room-1', region]), null)).toBe(false);
  });

  it('does not match an unrelated query', () => {
    expect(isSameGamesList(fakeQuery(['games', 'currently-playing']), null)).toBe(false);
    expect(isSameGamesList(fakeQuery(['me', 'currently-playing']), null)).toBe(false);
  });
});
