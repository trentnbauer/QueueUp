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
  g.timeLimitS = 30; // a timed round (with none the game is endless)
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Slides under the coin that is closest to reaching the catchers, keeping out from under any bomb that is on its way down (a bomb is instant death). */
function steer(g: CoinsGame, id: string) {
  const snap = g.snapshot();
  const self = me(g, id);
  const below = snap.items.filter((i) => i.y < COINS_PLAYER_Y + 0.02);
  const coin = below.filter((i) => i.kind === 'coin').sort((a, b) => b.y - a.y)[0];
  const bombs = below.filter((i) => i.kind === 'bomb' && i.y > 0.25);
  const clear = (x: number) => bombs.every((b) => Math.abs(b.x - x) > 0.12);
  let target = coin ? coin.x : self.x;
  if (!clear(target)) target = [0.12, -0.12, 0.24, -0.24, 0.36, -0.36].map((d) => Math.min(0.95, Math.max(0.05, target + d))).find(clear) ?? self.x;
  // Never walk through a bomb that is about to land on the way.
  const blocking = bombs.some((b) => b.y > 0.6 && Math.abs(b.x - self.x) > 0.1 && (b.x - self.x) * (b.x - target) < 0 && Math.abs(b.x - target) < 0.12 + Math.abs(self.x - target));
  if (!clear(self.x)) {
    const nearest = bombs.sort((a, b) => Math.abs(a.x - self.x) - Math.abs(b.x - self.x))[0];
    g.input(id, nearest.x > self.x ? -1 : 1, 0);
  } else g.input(id, blocking || Math.abs(target - self.x) < 0.015 ? 0 : target > self.x ? 1 : -1, 0);
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
    g.input('b', 0, 0); // stands still in the middle, until a bomb gets them
    play(g, ['a'], 40_000);
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
  });

  it('has no winner when the time is up with nothing caught, or with the best scores tied', () => {
    const g = started(['a', 'b']);
    // Nothing falls, so nobody catches or is hit: 0 each when the 30 seconds are up.
    (g as unknown as { spawnItem: () => void }).spawnItem = () => {};
    while (g.snapshot().phase === 'playing') g.tick(STEP);
    expect(g.snapshot().winnerId).toBeNull();
    expect(me(g, 'a').meters).toBe(me(g, 'b').meters);
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
    (g as unknown as { knockOut: () => void }).knockOut = () => {}; // so a bomb does not end the run being watched
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

  it('a bomb is instant death: out for the run, keeping the coins they had, and a solo run ends', () => {
    const g = started(['a']);
    let coins = 0;
    for (let t = 0; t < 29_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const snap = g.snapshot();
      const self = me(g, 'a');
      coins = self.meters;
      const bomb = snap.items.filter((i) => i.kind === 'bomb').sort((x, y) => y.y - x.y)[0];
      // Head for a bomb on purpose.
      g.input('a', bomb ? (Math.abs(bomb.x - self.x) < 0.01 ? 0 : bomb.x > self.x ? 1 : -1) : 0, 0);
      g.tick(STEP);
    }
    expect(me(g, 'a').alive).toBe(false);
    expect(g.snapshot().phase).toBe('over');
    expect(me(g, 'a').meters).toBeGreaterThanOrEqual(coins);
    expect(g.snapshot().history[0].meters).toBe(me(g, 'a').meters);
  });

  it('puts the one who is hit out and lets the other carry on, and the last one standing wins', () => {
    const g = started(['a', 'b']);
    g.input('b', 0, 0);
    // a stays out of the way of everything; b stands in the middle until a bomb lands on them.
    play(g, ['a'], 40_000);
    expect(me(g, 'b').alive).toBe(false);
    expect(g.snapshot().winnerId).toBe('a');
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
    (g as unknown as { knockOut: () => void }).knockOut = () => {}; // so a bomb does not end the run being watched
    const first = g.snapshot().speed;
    run(g, 20_000);
    const later = g.snapshot().speed;
    expect(later).toBeGreaterThan(first);
    expect(later).toBeLessThanOrEqual(0.7);
  });
});

describe('CoinsGame endless (no time limit)', () => {
  function endless(ids: string[], seed = 0.3) {
    const g = new CoinsGame(seeded(seed));
    ids.forEach((id) => g.join(id));
    run(g, 3200);
    return g;
  }

  it('has no clock and no lives', () => {
    const g = endless(['a']);
    expect(g.snapshot().limitMs).toBe(0);
    expect(g.snapshot().roundLeftMs).toBe(0);
    expect('lives' in me(g, 'a')).toBe(false);
  });

  it('goes on past 30 seconds for someone who keeps catching', () => {
    const g = endless(['a']);
    let survived = 0;
    for (let t = 0; t < 45_000 && g.snapshot().phase === 'playing'; t += STEP) {
      steer(g, 'a');
      g.tick(STEP);
      survived = t;
    }
    // Past the end of a timed round, still going (never ended by the clock).
    expect(survived).toBeGreaterThan(20_000);
    expect(g.snapshot().run).toBe(1);
  });

  it('never puts anyone out for a coin that gets away: only a bomb, or the health bar running out, does', () => {
    const g = endless(['a']);
    g.hpDrainScale = 0; // this is about a coin getting away, which costs nothing by itself
    // Nothing but coins fall (a draw this high is never under a bomb's chance), all of them away from a catcher in the left corner.
    (g as unknown as { rng: () => number }).rng = () => 0.99;
    g.input('a', -1, 0);
    run(g, 1500);
    g.input('a', 0, 0);
    run(g, 60_000);
    expect(g.snapshot().phase).toBe('playing');
    expect(me(g, 'a').alive).toBe(true);
    expect(me(g, 'a').meters).toBe(0);
  });

  it('has a health bar that drains all the time, is refilled by each coin, and puts a catcher out at zero', () => {
    const g = endless(['a']);
    expect(me(g, 'a').hp).toBeCloseTo(10, 0);
    run(g, 3000);
    const drained = me(g, 'a').hp as number;
    expect(drained).toBeLessThan(9);
    // Nothing but coins, all of them far from a catcher in the left corner: nothing refills it, so it runs out.
    (g as unknown as { rng: () => number }).rng = () => 0.99;
    g.input('a', -1, 0);
    let t = 0;
    for (; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).toBe('over');
    expect(me(g, 'a').alive).toBe(false);
    expect(t).toBeLessThan(25_000);
    expect(g.snapshot().winnerId).toBeNull();
  });

  it('refills the bar by a coin each, up to a most of 20', () => {
    const g = endless(['a']);
    const before = me(g, 'a').hp as number;
    g.hpDrainScale = 0;
    let caught = 0;
    for (let t = 0; t < 40_000 && caught < 3; t += STEP) {
      steer(g, 'a');
      g.tick(STEP);
      caught = me(g, 'a').meters;
    }
    expect(me(g, 'a').hp).toBeCloseTo(Math.min(20, before + me(g, 'a').meters), 5);
    for (let t = 0; t < 60_000 && me(g, 'a').alive && (me(g, 'a').hp as number) < 20; t += STEP) {
      steer(g, 'a');
      g.tick(STEP);
    }
    expect(me(g, 'a').hp).toBeLessThanOrEqual(20);
  });

  it('has no health bar in a timed round', () => {
    const g = started(['a']);
    expect(me(g, 'a').hp).toBeNull();
  });

  it('keeps getting quicker past 40 seconds, with no top speed', () => {
    const speedAt = (seconds: number) => {
      const g = endless(['a']);
      g.hpDrainScale = 0;
      (g as unknown as { knockOut: () => void }).knockOut = () => {};
      run(g, seconds * 1000);
      return g.snapshot().speed;
    };
    expect(speedAt(80)).toBeGreaterThan(speedAt(40) + 0.5);
  });

  it('ends a solo run when a bomb is caught, keeping the score, with nobody winning', () => {
    const g = endless(['a']);
    // Bombs (and coins between them) fall at the left edge, onto a catcher standing in that corner.
    (g as unknown as { rng: () => number }).rng = () => 0;
    g.input('a', -1, 0);
    run(g, 1500);
    g.input('a', 0, 0);
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).toBe('over');
    expect(me(g, 'a').alive).toBe(false);
    expect(g.snapshot().winnerId).toBeNull();
  });

  it('gets quicker and busier without a stop, and more of what falls is bombs', () => {
    const speedAt = (seconds: number) => {
      const g = endless(['a']);
      (g as unknown as { knockOut: () => void }).knockOut = () => {};
      run(g, seconds * 1000);
      return g.snapshot().speed;
    };
    expect(speedAt(35)).toBeGreaterThan(speedAt(5) + 0.4);
    const bombShare = (from: number, to: number) => {
      const g = endless(['a']);
      (g as unknown as { knockOut: () => void }).knockOut = () => {};
      const kinds = new Map<number, string>();
      for (let t = 0; t < to * 1000; t += STEP) {
        g.tick(STEP);
        if (t >= from * 1000) for (const i of g.snapshot().items) kinds.set(i.n, i.kind);
      }
      const all = [...kinds.values()];
      return all.filter((k) => k === 'bomb').length / all.length;
    };
    expect(bombShare(30, 50)).toBeGreaterThan(bombShare(0, 12) + 0.08);
  });
});
