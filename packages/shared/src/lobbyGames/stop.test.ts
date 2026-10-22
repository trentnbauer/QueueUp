import { describe, expect, it } from 'vitest';
import { StopGame } from './stop.js';

const STEP = 33;
const run = (g: StopGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const me = (g: StopGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 7) {
  const g = new StopGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until a sweep is under way in this round or later. */
function toSweep(g: StopGame, round = 1) {
  for (let i = 0; i < 600; i++) {
    const s = g.snapshot();
    if (s.stage === 'sweep' && s.round >= round) return s;
    g.tick(STEP);
  }
  throw new Error('no sweep started');
}

/** Presses stop when the marker is inside the zone, close to the middle, for this player. */
function stopInZone(g: StopGame, id: string) {
  for (let i = 0; i < 400 && g.snapshot().stage === 'sweep' && me(g, id).alive && !me(g, id).stopped; i++) {
    const s = g.snapshot();
    if (Math.abs(s.marker - s.centre) < Math.min(s.half * 0.5, 0.02)) {
      g.action(id, 'stop');
      return;
    }
    g.tick(STEP);
  }
}

describe('StopGame', () => {
  it('starts a sweep after a moment, with a zone clear of the ends of the bar', () => {
    const g = started(['a']);
    const s = toSweep(g);
    expect(s.round).toBe(1);
    expect(s.marker).toBeGreaterThanOrEqual(0);
    expect(s.marker).toBeLessThanOrEqual(1);
    expect(s.centre - s.half).toBeGreaterThan(0);
    expect(s.centre + s.half).toBeLessThan(1);
  });

  it('lets a stop inside the zone through to the next round, with the stop shown', () => {
    const g = started(['a', 'b']);
    toSweep(g);
    stopInZone(g, 'a');
    expect(me(g, 'a')).toMatchObject({ stopped: true, alive: true });
    expect(me(g, 'a').at).toBeGreaterThanOrEqual(0);
    stopInZone(g, 'b');
    run(g, 100);
    expect(g.snapshot().stage).toBe('result');
    expect(me(g, 'a').meters).toBe(1);
    expect(toSweep(g, 2).round).toBe(2);
  });

  it('knocks out a player who stops outside the zone, and the last one in wins', () => {
    const g = started(['a', 'b']);
    toSweep(g);
    // b presses when the marker is well outside the zone.
    for (let i = 0; i < 400 && me(g, 'b').alive; i++) {
      const s = g.snapshot();
      if (Math.abs(s.marker - s.centre) > s.half + 0.08) g.action('b', 'stop');
      else g.tick(STEP);
    }
    expect(me(g, 'b').alive).toBe(false);
    g.tick(STEP); // only a is left in
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: 'a' });
  });

  it('knocks out anyone who has not stopped when the sweep runs out', () => {
    const g = started(['a', 'b']);
    toSweep(g);
    stopInZone(g, 'a');
    run(g, 5500);
    expect(me(g, 'b').alive).toBe(false);
    expect(g.snapshot().winnerId === 'a' || g.snapshot().phase === 'over').toBe(true);
  });

  it('makes each round faster with a smaller zone', () => {
    const g = started(['a']);
    const first = toSweep(g);
    stopInZone(g, 'a');
    run(g, 200);
    const second = toSweep(g, 2);
    expect(second.half).toBeLessThan(first.half);
    expect(second.round).toBe(2);
  });

  it('ends a solo run when the player misses, with their cleared rounds as the score', () => {
    const g = started(['a']);
    toSweep(g);
    stopInZone(g, 'a');
    run(g, 200);
    toSweep(g, 2);
    run(g, 5500);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
    expect(g.snapshot().history.at(-1)?.meters).toBe(1);
  });

  it('ignores a press outside a sweep, twice, or from someone only watching', () => {
    const g = new StopGame(lcg(3));
    g.join('a');
    g.action('a', 'stop');
    run(g, 3200);
    g.action('a', 'stop'); // before the first sweep
    expect(me(g, 'a').at).toBe(-1);
    toSweep(g);
    g.join('late');
    g.action('late', 'stop');
    expect(me(g, 'late').at).toBe(-1);
    stopInZone(g, 'a');
    const at = me(g, 'a').at;
    g.action('a', 'stop');
    expect(me(g, 'a').at).toBe(at);
  });

  it('plays the same zones for the same seed', () => {
    const zones = (seed: number) => {
      const g = started(['a'], seed);
      const out: number[] = [];
      for (let r = 1; r <= 3 && g.snapshot().phase === 'playing'; r++) {
        const s = toSweep(g, r);
        out.push(s.centre);
        stopInZone(g, 'a');
        run(g, 100);
      }
      return out;
    };
    expect(zones(5)).toEqual(zones(5));
  });

  it('judges a stop on the marker the player saw, not where it had got to when the tap arrived', () => {
    const at = (behind: number) => {
      const g = started(['a', 'b'], 11);
      toSweep(g);
      run(g, 330);
      const sweep = g.snapshot();
      g.pressBehindMs = behind;
      g.action('a', 'stop');
      g.pressBehindMs = 0;
      return { stopped: me(g, 'a').at, now: sweep.marker };
    };
    const fresh = at(0);
    const late = at(300);
    // With no lag the stop is where the marker is; told it was looking at the picture of 300 ms ago, it is where the marker was then.
    expect(fresh.stopped).toBeCloseTo(fresh.now, 1);
    expect(Math.abs(late.stopped - late.now)).toBeGreaterThan(0.05);
  });
});
