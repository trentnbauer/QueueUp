import { describe, expect, it } from 'vitest';
import { stableOrder } from './useStableOrder';

const g = (id: string, score = 0) => ({ id, score });

describe('stableOrder', () => {
  it('shows the list as given the first time and remembers its order', () => {
    const list = [g('a'), g('b'), g('c')];
    const first = stableOrder(null, list, 'queue');
    expect(first.items).toBe(list);
    expect(first.ids).toEqual({ key: 'queue', ids: ['a', 'b', 'c'] });
  });

  it('keeps the remembered order when only the games\' contents changed (e.g. a vote re-sorted them)', () => {
    const first = stableOrder(null, [g('a', 1), g('b', 0), g('c', 0)], 'queue');
    // "c" got a vote and now sorts to the top, but the rows stay where they were.
    const next = stableOrder(first.ids, [g('c', 5), g('a', 1), g('b', 0)], 'queue');
    expect(next.items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(next.items.find((x) => x.id === 'c')?.score).toBe(5);
  });

  it('takes the new order when the view changes', () => {
    const first = stableOrder(null, [g('a'), g('b')], 'queue');
    const next = stableOrder(first.ids, [g('b'), g('a')], 'playing');
    expect(next.items.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('takes the new order when a game is added, removed or replaced', () => {
    const first = stableOrder(null, [g('a'), g('b')], 'queue');
    expect(stableOrder(first.ids, [g('c'), g('a'), g('b')], 'queue').items.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(stableOrder(first.ids, [g('b')], 'queue').items.map((x) => x.id)).toEqual(['b']);
    expect(stableOrder(first.ids, [g('a'), g('z')], 'queue').items.map((x) => x.id)).toEqual(['a', 'z']);
  });
});
