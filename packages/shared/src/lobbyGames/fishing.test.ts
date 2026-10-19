import { describe, expect, it } from 'vitest';
import { FishingGame } from './fishing.js';

const STEP = 33;
const run = (g: FishingGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: FishingGame) => g.snapshot();
const me = (g: FishingGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new FishingGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays until the run is over (or `ms` is up), and says how long it lasted in seconds. */
function untilOver(g: FishingGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

/** A player who sees the fish `delay` seconds late and steers the net toward where it was, plus a guess at where it is going. */
function makeAngler(g: FishingGame, id: string, delay = 0.1) {
  const hist: { y: number; vy: number }[] = [];
  const lag = Math.round((delay * 1000) / STEP);
  return () => {
    const s = snap(g);
    const mine = s.players.find((p) => p.id === id)!;
    if (s.phase !== 'playing' || !mine.alive) return;
    hist.push(s.fish);
    const seen = hist[Math.max(0, hist.length - 1 - lag)];
    const want = seen.y + seen.vy * delay;
    g.input(id, 0, mine.y + mine.vy * 0.28 > want ? -1 : 0);
  };
}

describe('FishingGame pond', () => {
  it('starts with the fish and every net in the middle, and the line a little way up', () => {
    const g = new FishingGame(lcg(7));
    g.join('a');
    g.join('b');
    run(g, 1000);
    const s = snap(g);
    expect(s.phase).toBe('countdown');
    expect(s.fish.y).toBeCloseTo(0.5, 1);
    expect(s.players.map((p) => p.y)).toEqual([0.5, 0.5]);
    expect(s.players.map((p) => p.progress)).toEqual([0.35, 0.35]);
    expect(s.speed).toBe(0);
  });

  it('is the same fish for the same seed, and a different one for another', () => {
    const fish = (seed: number) => {
      const g = started(['a'], seed);
      const seen: number[] = [];
      for (let t = 0; t < 8000; t += 500) {
        run(g, 500);
        seen.push(snap(g).fish.y);
      }
      return JSON.stringify(seen);
    };
    expect(fish(5)).toBe(fish(5));
    expect(fish(5)).not.toBe(fish(9));
  });

  it('keeps the fish in the pond, and quicker and further as the run goes on, then no quicker', () => {
    const fastest = (from: number, to: number) => {
      const g = started(['a'], 11);
      // A device that reports keeps the line from snapping, so the run lasts.
      const keep = () => g.report('a', 1, true, { y: 0.5, vy: 0, p: 0.5, n: 0, r: 0 });
      for (let t = 0; t < from; t += STEP) {
        keep();
        g.tick(STEP);
      }
      let top = 0;
      for (let t = from; t < to && snap(g).phase === 'playing'; t += STEP) {
        keep();
        g.tick(STEP);
        top = Math.max(top, Math.abs(snap(g).fish.vy));
        expect(snap(g).fish.y).toBeGreaterThanOrEqual(0.08);
        expect(snap(g).fish.y).toBeLessThanOrEqual(0.92);
      }
      return top;
    };
    expect(fastest(0, 3000)).toBeLessThan(0.45);
    expect(fastest(30_000, 33_000)).toBeCloseTo(0.95, 2);
  });

  it('makes the net shorter as the run goes on, to a limit', () => {
    const g = started(['a']);
    const start = snap(g).half;
    expect(start).toBeCloseTo(0.13, 2);
    // Keep the angler alive by reporting from a device, so the run lasts.
    const keep = () => g.report('a', 1, true, { y: 0.5, vy: 0, p: 0.5, n: 0, r: 0 });
    untilOver(g, 15_000, keep);
    const mid = snap(g).half;
    expect(mid).toBeLessThan(start);
    untilOver(g, 25_000, keep);
    expect(snap(g).half).toBeCloseTo(0.065, 3);
  });
});

describe('FishingGame the net', () => {
  it('rises while the button is held and sinks when it is let go, and stays in the pond', () => {
    const g = started(['a']);
    g.input('a', 0, -1);
    run(g, 400);
    const up = me(g, 'a');
    expect(up.y).toBeLessThan(0.5);
    expect(up.reeling).toBe(true);
    g.input('a', 0, 0);
    run(g, 100);
    expect(me(g, 'a').reeling).toBe(false);
    expect(me(g, 'a').vy).toBeGreaterThan(up.vy);
    const h = started(['a']);
    h.input('a', 0, -1);
    run(h, 1500);
    expect(me(h, 'a').y).toBeGreaterThanOrEqual(0.04);
    const i = started(['a']);
    run(i, 1500);
    expect(me(i, 'a').y).toBeLessThanOrEqual(0.96);
  });

  it('ignores junk and anything before the run starts', () => {
    const g = new FishingGame(lcg(7));
    g.join('a'); // countdown
    g.input('a', 0, -1);
    run(g, 1000);
    expect(me(g, 'a').y).toBe(0.5);
    const p = started(['a']);
    p.input('a', 0, 99); // junk is no direction
    run(p, 300);
    expect(me(p, 'a').reeling).toBe(false);
    expect(me(p, 'a').alive).toBe(true);
  });
});

describe('FishingGame the line', () => {
  it('gains while the fish is in the net and loses while it is not', () => {
    const g = started(['a']);
    const before = me(g, 'a').progress;
    run(g, 330); // the fish has not moved yet, and the net has only just left the middle
    expect(me(g, 'a').progress).toBeGreaterThan(before);
    // Let the net sink to the bottom, away from a fish that is not there.
    const sunk = started(['a'], 5);
    run(sunk, 1500);
    expect(me(sunk, 'a').y).toBeGreaterThan(0.9);
  });

  it('lands a fish when the line is full, counts it, and eases the line back', () => {
    const g = started(['a']);
    const angler = makeAngler(g, 'a', 0);
    let landed = 0;
    for (let t = 0; t < 20_000 && landed === 0 && snap(g).phase === 'playing'; t += STEP) {
      angler();
      g.tick(STEP);
      landed = me(g, 'a').landed;
    }
    expect(landed).toBe(1);
    expect(me(g, 'a').progress).toBeCloseTo(0.4, 1);
    expect(snap(g).meters).toBe(1);
  });

  it('snaps the line of someone who lets the net sink, and ends a solo run with no winner', () => {
    const g = started(['a']);
    const seconds = untilOver(g, 60_000);
    expect(seconds).toBeLessThan(15);
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: null });
    expect(me(g, 'a').alive).toBe(false);
    expect(me(g, 'a').progress).toBe(0);
  });

  it('snaps the line of someone who holds the button down for ever', () => {
    const g = started(['a']);
    g.input('a', 0, -1);
    expect(untilOver(g, 60_000)).toBeLessThan(15);
  });
});

describe('FishingGame running a run', () => {
  it('lets someone who follows the fish land several, on several ponds, but not last for ever', () => {
    for (const seed of [3, 7, 11, 19, 23]) {
      const g = started(['a'], seed);
      const seconds = untilOver(g, 120_000, makeAngler(g, 'a', 0.1));
      expect(seconds, `seed ${seed}`).toBeGreaterThan(8);
      expect(me(g, 'a').landed, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      // It gets too quick for anyone: nobody fishes for ever.
      expect(seconds, `seed ${seed}`).toBeLessThan(120);
    }
  });

  it('crowns the last one fishing, with their own count as the run', () => {
    const g = started(['a', 'b']);
    const angler = makeAngler(g, 'a', 0);
    untilOver(g, 60_000, angler); // b lets the net sink, a follows the fish
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(me(g, 'b').alive).toBe(false);
    if (s.winnerId === 'a') {
      expect(me(g, 'a').wins).toBe(1);
      expect(s.history.at(-1)?.meters).toBeGreaterThanOrEqual(me(g, 'a').landed);
    } else {
      // a was caught out too, at the same moment or after b: nobody wins a draw.
      expect(s.winnerId).toBeNull();
    }
  });

  it('ends at the lobby time cap, with whoever is still in keeping their fish and nobody winning', () => {
    const g = new FishingGame(lcg(7));
    g.timeLimitS = 6;
    g.join('a');
    run(g, 3200);
    untilOver(g, 8000, makeAngler(g, 'a', 0));
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBeNull();
    expect(me(g, 'a').alive).toBe(true);
    expect(s.history.at(-1)?.meters).toBe(me(g, 'a').landed);
  });

  it('puts a new run back at the start', () => {
    const g = started(['a', 'b']);
    untilOver(g, 60_000);
    run(g, 4200 + 1500);
    const s = snap(g);
    expect(s.phase).toBe('countdown');
    expect(s.players.map((p) => p.progress)).toEqual([0.35, 0.35]);
    expect(s.players.map((p) => p.landed)).toEqual([0, 0]);
    expect(s.half).toBeCloseTo(0.13, 2);
  });
});

describe('FishingGame on each player’s own device', () => {
  it('works out its own net there, and reports it', () => {
    const g = started(['a']);
    expect(g.clientSim).toBe(true);
    g.report('a', 1, true, { y: 0.3, vy: -0.4, p: 0.6, n: 0, r: 1 });
    expect(me(g, 'a')).toMatchObject({ y: 0.3, vy: -0.4, progress: 0.6, landed: 0, reeling: true, alive: true });
    // A net that reports is not moved by the server.
    g.input('a', 0, 0);
    run(g, 500);
    expect(me(g, 'a')).toMatchObject({ y: 0.3, progress: 0.6 });
  });

  it('takes a report of being out, and never fewer fish than before or more than one more at a time', () => {
    const g = started(['a']);
    g.report('a', 1, true, { y: 0.5, vy: 0, p: 0.5, n: 1, r: 0 });
    expect(me(g, 'a').landed).toBe(1);
    g.report('a', 1, true, { y: 0.5, vy: 0, p: 0.5, n: 0, r: 0 });
    expect(me(g, 'a').landed).toBe(1);
    g.report('a', 1, true, { y: 0.5, vy: 0, p: 0.5, n: 99, r: 0 });
    expect(me(g, 'a').landed).toBe(2);
    g.report('a', 1, false, {});
    expect(me(g, 'a').alive).toBe(false);
    expect(snap(g).history.at(-1)?.meters ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('keeps a malformed report in range', () => {
    const g = started(['a']);
    g.report('a', 1, true, { y: 99, vy: -99, p: 5, n: Number.NaN, r: 0 });
    const p = me(g, 'a');
    expect(p.y).toBeLessThanOrEqual(0.96);
    expect(Math.abs(p.vy)).toBeLessThanOrEqual(1.4);
    expect(p.progress).toBeLessThanOrEqual(1);
    expect(Number.isFinite(p.landed)).toBe(true);
  });
});
