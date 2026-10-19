import { describe, expect, it } from 'vitest';
import { GRAVITY_PLAYER_R, GRAVITY_X } from '../spinLobby.js';
import { GravityGame } from './gravity.js';

const STEP = 33;
const run = (g: GravityGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: GravityGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

function started(ids: string[], seed = 0.3) {
  const g = new GravityGame(seeded(seed));
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
    if (soon && soon.side === player.side) g.action(id, 'flip');
    g.tick(STEP);
  }
}

describe('GravityGame', () => {
  it('starts everyone on the floor', () => {
    const g = started(['a', 'b']);
    expect(g.snapshot().phase).toBe('playing');
    for (const p of g.snapshot().players) expect(p).toMatchObject({ side: 0, alive: true });
  });

  it('flips to the other side in about 0.3 seconds, and only from a side', () => {
    const g = started(['a']);
    g.action('a', 'flip');
    expect(me(g, 'a').side).toBe(1);
    run(g, 150);
    const half = me(g, 'a').y;
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
    g.action('a', 'flip'); // part way across: ignored
    expect(me(g, 'a').side).toBe(1);
    run(g, 250);
    expect(me(g, 'a').y).toBeCloseTo(1 - GRAVITY_PLAYER_R, 3);
    g.action('a', 'flip');
    expect(me(g, 'a').side).toBe(0);
  });

  it('makes the same spikes for the same seed, on both sides, always far enough apart to flip between', () => {
    const spikes = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 500);
      return g.snapshot().spikes;
    };
    expect(spikes(0.4)).toEqual(spikes(0.4));
    const sides = new Set<number>();
    for (const seed of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const s = spikes(seed);
      for (const k of s) sides.add(k.side);
      for (let i = 1; i < s.length; i++) expect(s[i].x - s[i].w / 2 - (s[i - 1].x + s[i - 1].w / 2)).toBeGreaterThan(0.3);
    }
    expect(sides.size).toBe(2);
  });

  it('knocks out a player who stays put when a spike arrives on their side', () => {
    const g = started(['a']);
    run(g, 30_000);
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
