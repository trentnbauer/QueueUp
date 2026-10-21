import { describe, expect, it } from 'vitest';
import { GRAVITY_PLAYER_R, GRAVITY_X } from '../spinLobby.js';
import { GravityGame } from './gravity.js';

const STEP = 33;
const run = (g: GravityGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: GravityGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

/** A varying random source, so the obstacles are a mix and not all one kind. */
const lcg = (seed: number) => {
  let s = Math.max(1, Math.floor(seed * 2147483646));
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 0.3, mixed = false) {
  const g = new GravityGame(mixed ? lcg(seed) : seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Flips to the safe side when a spike is about to arrive on the side it is on. */
function playBot(g: GravityGame, id: string, ms: number) {
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    const snap = g.snapshot();
    const player = me(g, id);
    const soon = snap.spikes.find((s) => s.x + s.w / 2 > GRAVITY_X - GRAVITY_PLAYER_R && s.x - s.w / 2 < GRAVITY_X + snap.speed * 0.5 + GRAVITY_PLAYER_R);
    // Floating blocks are passed by staying on a side; a flip is only needed for a spike on the side the player is on.
    if (soon && soon.side === player.side) g.action(id, 'flip');
    g.tick(STEP);
  }
}

/** Every obstacle that comes into view while a bot plays, by its number: its kind and where it was. */
function seenObstacles(g: GravityGame, id: string, ms: number) {
  const seen = new Map<number, { side: number; x: number; w: number }>();
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    playBot(g, id, STEP);
    const dist = g.snapshot().meters;
    for (const s of g.snapshot().spikes) if (!seen.has(s.n)) seen.set(s.n, { side: s.side, x: s.x + dist, w: s.w });
  }
  return seen;
}

describe('GravityGame', () => {
  it('starts everyone on the floor', () => {
    const g = started(['a', 'b']);
    expect(g.snapshot().phase).toBe('playing');
    for (const p of g.snapshot().players) expect(p).toMatchObject({ side: 0, alive: true });
  });

  it('flips to the other side in about 0.7 seconds', () => {
    const g = started(['a']);
    g.action('a', 'flip');
    expect(me(g, 'a').side).toBe(1);
    run(g, 350);
    const half = me(g, 'a').y;
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
    run(g, 450);
    expect(me(g, 'a').y).toBeCloseTo(1 - GRAVITY_PLAYER_R, 3);
    g.action('a', 'flip');
    expect(me(g, 'a').side).toBe(0);
  });

  it('turns a flip round part way across, but not again for a moment, so the button cannot hold a player in the middle', () => {
    const g = started(['a']);
    g.action('a', 'flip');
    run(g, 150);
    const turned = me(g, 'a').y;
    g.action('a', 'flip'); // pressed again too soon: ignored
    expect(me(g, 'a').side).toBe(1);
    run(g, 100);
    g.action('a', 'flip'); // after the wait, it turns them round
    expect(me(g, 'a').side).toBe(0);
    run(g, 100);
    expect(me(g, 'a').y).toBeLessThan(turned + 0.35);
    // Mashing for a long time cannot keep a player away from both ends: they still reach one on the way.
    const m = started(['a']);
    let ends = 0;
    for (let t = 0; t < 3000; t += STEP) {
      m.action('a', 'flip');
      m.tick(STEP);
      const y = me(m, 'a').y;
      if (y < 0.2 || y > 0.8) ends++;
    }
    expect(ends).toBeGreaterThan(0);
  });

  it('lets a player tap every fifth of a second to keep floating near the middle', () => {
    const g = started(['a']);
    let low = 1;
    let high = 0;
    g.action('a', 'flip'); // up to the middle, then a tap every fifth of a second turns it round each time
    for (let t = 0; t < 1500; t += STEP) {
      if (t >= 330 && (t - 330) % 198 < STEP) g.action('a', 'flip');
      g.tick(STEP);
      if (t > 600) {
        low = Math.min(low, me(g, 'a').y);
        high = Math.max(high, me(g, 'a').y);
      }
    }
    expect(low).toBeGreaterThan(0.2);
    expect(high).toBeLessThan(0.8);
  });

  it('speeds up past 1 screen a second, and sends bigger obstacles the further a run has come', () => {
    const g = started(['a'], 0.4, true);
    const heights = new Map<number, number>();
    for (let t = 0; t < 60_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
      playBot(g, 'a', STEP);
      for (const s of g.snapshot().spikes) if (!heights.has(s.n)) heights.set(s.n, s.h / (s.side === 2 ? 0.26 : 0.14));
    }
    expect(g.snapshot().speed).toBeGreaterThan(1);
    const sizes = [...heights.entries()].sort((x, y) => x[0] - y[0]).map((e) => e[1]);
    expect(sizes[0]).toBeCloseTo(1, 1);
    expect(sizes[sizes.length - 1]).toBeGreaterThan(1.3);
  });

  it('puts floating blocks in the middle among the spikes, and a flight across one is fatal while an edge is safe', () => {
    const kinds = new Set<number>();
    for (const seed of [0.1, 0.3, 0.5]) {
      for (const o of seenObstacles(started(['a'], seed, true), 'a', 30_000).values()) kinds.add(o.side);
    }
    expect(kinds).toEqual(new Set([0, 1, 2]));
    // Find a seed where the first obstacle is a floating block, and fly across it vs stay put.
    for (let seed = 0.01; seed < 1; seed += 0.01) {
      const probe = started(['a'], seed, true);
      run(probe, 200);
      const first = probe.snapshot().spikes[0];
      if (!first || first.side !== 2) continue;
      const stays = started(['a', 'b'], seed, true);
      const flies = started(['a', 'b'], seed, true);
      let flipped = false;
      for (let t = 0; t < 6000 && stays.snapshot().phase === 'playing' && me(flies, 'a').alive; t += STEP) {
        // One stays on the floor; the other flips to the ceiling so as to be crossing the middle just as the block arrives.
        const block = flies.snapshot().spikes.find((o) => o.side === 2);
        if (!flipped && block && block.x - GRAVITY_X < flies.snapshot().speed * 0.35) {
          flies.action('a', 'flip');
          flipped = true;
        }
        flies.tick(STEP);
        stays.tick(STEP);
        if (me(stays, 'a').alive === false) break;
      }
      expect(flipped).toBe(true);
      expect(me(flies, 'a').alive).toBe(false);
      expect(me(stays, 'a').alive).toBe(true);
      return;
    }
    throw new Error('no seed opened with a floating block');
  });

  it('makes the same obstacles for the same seed, always far enough apart to flip between', () => {
    const order = (seed: number) => [...seenObstacles(started(['a'], seed, true), 'a', 20_000).entries()].map(([n, o]) => `${n}:${o.side}`);
    expect(order(0.4)).toEqual(order(0.4));
    // Whenever several are in view at once, there is room between them.
    for (const seed of [0.2, 0.6]) {
      const g = started(['a'], seed, true);
      for (let t = 0; t < 20_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
        playBot(g, 'a', STEP);
        const s = [...g.snapshot().spikes].sort((x, y) => x.x - y.x);
        for (let i = 1; i < s.length; i++) expect(s[i].x - s[i].w / 2 - (s[i - 1].x + s[i - 1].w / 2)).toBeGreaterThan(0.3);
      }
    }
  });

  it('knocks out a player who stays put when a spike arrives on their side', () => {
    const g = started(['a']);
    for (let t = 0; t < 30_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).not.toBe('playing');
    expect(g.snapshot().history.at(-1)?.meters).toBeGreaterThanOrEqual(0);
  });

  it('lets a player who flips in time run a long way, on several courses', () => {
    for (const seed of [0.1, 0.3, 0.55, 0.8, 0.95]) {
      const g = started(['a'], seed);
      playBot(g, 'a', 60_000);
      expect(me(g, 'a').alive, `seed ${seed}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(200);
    }
  });

  it('gives the run to the last runner', () => {
    const g = started(['a', 'b']);
    for (let t = 0; t < 90_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const snap = g.snapshot();
      const player = me(g, 'a');
      const soon = snap.spikes.find((s) => s.x + s.w / 2 > GRAVITY_X - GRAVITY_PLAYER_R && s.x - s.w / 2 < GRAVITY_X + snap.speed * 0.5 + GRAVITY_PLAYER_R);
      if (soon && soon.side === player.side) g.action('a', 'flip');
      g.tick(STEP);
    }
    expect(g.snapshot().winnerId).toBe('a');
  });
});
