import { describe, expect, it } from 'vitest';
import { COINS_PLAYER_Y } from '../spinLobby.js';
import { CoinsGame } from './coins.js';

const STEP = 33;
const run = (g: CoinsGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: CoinsGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

function started(ids: string[], seed = 0.3) {
  const g = new CoinsGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Slides under the coin that is closest to reaching the catchers, steering clear of bombs. */
function steer(g: CoinsGame, id: string) {
  const snap = g.snapshot();
  const self = me(g, id);
  const below = snap.items.filter((i) => i.y < COINS_PLAYER_Y + 0.02);
  const coin = below.filter((i) => i.kind === 'coin').sort((a, b) => b.y - a.y)[0];
  const bomb = below.filter((i) => i.kind === 'bomb' && i.y > 0.5).sort((a, b) => b.y - a.y)[0];
  let target = coin ? coin.x : 0.5;
  if (bomb && Math.abs(bomb.x - target) < 0.1) target = bomb.x + (target >= bomb.x ? 0.1 : -0.1);
  g.input(id, Math.abs(target - self.x) < 0.015 ? 0 : target > self.x ? 1 : -1, 0);
}

function play(g: CoinsGame, ids: string[], ms: number) {
  for (let t = 0; t < ms && g.snapshot().phase === 'playing'; t += STEP) {
    for (const id of ids) steer(g, id);
    g.tick(STEP);
  }
}

describe('CoinsGame rounds', () => {
  it('counts down for a lone catcher, then starts a round', () => {
    const g = new CoinsGame(seeded(0.3));
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
  });

  it('runs for 30 seconds, then ends a solo round with no winner and the score kept', () => {
    const g = started(['a']);
    expect(g.snapshot().roundLeftMs).toBeGreaterThan(29_000);
    play(g, ['a'], 40_000);
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBeNull();
    expect(me(g, 'a').alive).toBe(true);
    expect(snap.history).toHaveLength(1);
    expect(snap.history[0].meters).toBe(me(g, 'a').meters);
    expect(me(g, 'a').meters).toBeGreaterThan(10);
  });

  it('starts the next round by itself, with scores back to zero', () => {
    const g = started(['a']);
    play(g, ['a'], 40_000);
    run(g, 4200);
    expect(g.snapshot().phase).toBe('countdown');
    expect(g.snapshot().run).toBe(2);
    expect(me(g, 'a').meters).toBe(0);
  });

  it('gives the win to whoever caught the most', () => {
    const g = started(['a', 'b']);
    g.input('b', 0, 0); // stands still in the middle
    play(g, ['a'], 40_000);
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'a').meters).toBeGreaterThan(me(g, 'b').meters);
  });

  it('has no winner when the best scores are tied, or when nobody caught anything', () => {
    for (const seed of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const g = started(['a', 'b'], seed);
      // Both stand at opposite walls and never move again.
      g.input('a', -1, 0);
      g.input('b', 1, 0);
      run(g, 1500);
      g.input('a', 0, 0);
      g.input('b', 0, 0);
      while (g.snapshot().phase === 'playing') g.tick(STEP);
      const [a, b] = [me(g, 'a'), me(g, 'b')];
      const expected = a.meters === b.meters ? null : a.meters > b.meters ? 'a' : 'b';
      expect(g.snapshot().winnerId, `seed ${seed}`).toBe(a.meters === 0 && b.meters === 0 ? null : expected);
    }
  });

  it('lets someone who arrives mid-round watch, with no score, then play from the next one', () => {
    const g = started(['a']);
    g.join('b');
    expect(me(g, 'b').alive).toBe(false);
    play(g, ['a'], 40_000);
    expect(me(g, 'b').meters).toBe(0);
    for (let t = 0; t < 30_000 && g.snapshot().run < 2; t += STEP) g.tick(STEP);
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(me(g, 'b').alive).toBe(true);
  });
});

describe('CoinsGame items', () => {
  it('drops coins and the odd bomb, never two bombs in a row', () => {
    const g = started(['a']);
    const kinds = new Map<number, string>();
    for (let t = 0; t < 29_000; t += STEP) {
      g.tick(STEP);
      for (const i of g.snapshot().items) kinds.set(i.n, i.kind);
    }
    const list = [...kinds.entries()].sort((x, y) => x[0] - y[0]).map(([, k]) => k);
    expect(list.filter((k) => k === 'bomb').length).toBeGreaterThan(0);
    expect(list.filter((k) => k === 'coin').length).toBeGreaterThan(20);
    for (let i = 1; i < list.length; i++) expect(list[i] === 'bomb' && list[i - 1] === 'bomb').toBe(false);
  });

  it('a bomb stuns the catcher, who cannot move for a moment, and costs a coin', () => {
    const g = started(['a']);
    let stunnedAt: number | null = null;
    let before = 0;
    let tracked = false;
    for (let t = 0; t < 29_000 && !tracked; t += STEP) {
      const snap = g.snapshot();
      const self = me(g, 'a');
      const bomb = snap.items.filter((i) => i.kind === 'bomb').sort((x, y) => y.y - x.y)[0];
      // Head for a bomb on purpose.
      g.input('a', bomb ? (Math.abs(bomb.x - self.x) < 0.01 ? 0 : bomb.x > self.x ? 1 : -1) : 0, 0);
      g.tick(STEP);
      if (me(g, 'a').stunned && stunnedAt === null) {
        stunnedAt = me(g, 'a').x;
        before = self.meters;
        g.input('a', 1, 0);
        run(g, 300);
        expect(me(g, 'a').x).toBe(stunnedAt);
        expect(me(g, 'a').meters).toBeLessThanOrEqual(before);
        tracked = true;
      }
    }
    expect(tracked).toBe(true);
    run(g, 1500);
    expect(me(g, 'a').stunned).toBe(false);
  });

  it('never goes below zero coins', () => {
    const g = started(['a']);
    for (let t = 0; t < 29_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const bomb = g.snapshot().items.filter((i) => i.kind === 'bomb').sort((x, y) => y.y - x.y)[0];
      const self = me(g, 'a');
      g.input('a', bomb ? (bomb.x > self.x ? 1 : -1) : 0, 0);
      g.tick(STEP);
      expect(me(g, 'a').meters).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives each coin to only one catcher', () => {
    const g = started(['a', 'b']);
    let highest = 0;
    for (let t = 0; t < 30_000 && g.snapshot().phase === 'playing'; t += STEP) {
      steer(g, 'a');
      steer(g, 'b');
      g.tick(STEP);
      for (const i of g.snapshot().items) highest = Math.max(highest, i.n);
      expect(me(g, 'a').meters + me(g, 'b').meters).toBeLessThanOrEqual(highest);
    }
  });

  it('keeps catchers on screen', () => {
    const g = started(['a']);
    g.input('a', -1, 0);
    run(g, 5000);
    expect(me(g, 'a').x).toBeGreaterThan(0);
    g.input('a', 1, 0);
    run(g, 5000);
    expect(me(g, 'a').x).toBeLessThan(1);
  });

  it('makes the items the same for the same seed', () => {
    const course = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 5000);
      return JSON.stringify(g.snapshot().items);
    };
    expect(course(0.4)).toBe(course(0.4));
    expect(course(0.4)).not.toBe(course(0.9));
  });

  it('falls faster over a round, to a limit', () => {
    const g = started(['a']);
    const first = g.snapshot().speed;
    run(g, 20_000);
    const later = g.snapshot().speed;
    expect(later).toBeGreaterThan(first);
    expect(later).toBeLessThanOrEqual(0.7);
  });
});
