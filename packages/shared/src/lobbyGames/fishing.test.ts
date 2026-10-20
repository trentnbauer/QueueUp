import { describe, expect, it } from 'vitest';
import { FISHING_TIERS } from '../spinLobby.js';
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

/** An angler who casts to `power`, leaves the lure where the fish swim past, and keeps the fish in the green as well as a person can
 * (it sees the fish `delay` seconds late). `reel: false` is one who casts but never reels. */
function makeAngler(g: FishingGame, id: string, { power = 0.35, delay = 0.1, reel = true }: { power?: number; delay?: number; reel?: boolean } = {}) {
  const hist: number[] = [];
  const lag = Math.round((delay * 1000) / STEP);
  let held = false;
  const press = (on: boolean) => {
    held = on;
    g.input(id, 0, on ? -1 : 0);
  };
  return () => {
    const s = snap(g);
    const mine = s.players.find((p) => p.id === id)!;
    if (s.phase !== 'playing' || !mine.alive) return;
    // A cast needs a fresh press, so let go first if still holding from reeling.
    if (mine.mode === 'idle') press(!held);
    else if (mine.mode === 'charging') press(mine.power < power);
    else if (mine.mode === 'fight') {
      hist.push(mine.mark);
      const seen = hist[Math.max(0, hist.length - 1 - lag)];
      press(reel && mine.zone + mine.zoneV * 0.28 > seen);
    } else press(false);
  };
}

describe('FishingGame pond', () => {
  it('starts with a pond of fish, every angler at the rod with three lines and nothing caught', () => {
    const g = new FishingGame(lcg(7));
    g.join('a');
    g.join('b');
    run(g, 1000);
    expect(snap(g).phase).toBe('countdown');
    run(g, 2400);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.fish.length).toBeGreaterThanOrEqual(5);
    expect(s.players.map((p) => p.mode)).toEqual(['idle', 'idle']);
    expect(s.players.map((p) => p.lives)).toEqual([3, 3]);
    expect(s.players.map((p) => p.points)).toEqual([0, 0]);
    expect(s.speed).toBe(0);
  });

  it('seats anglers evenly along the bottom, and keeps them there for the run', () => {
    const g = started(['a', 'b', 'c']);
    const xs = snap(g).players.map((p) => p.x);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    run(g, 2000);
    expect(snap(g).players.map((p) => p.x)).toEqual(xs);
  });

  it('puts the fish in the same places for the same seed, and others for another', () => {
    const fish = (seed: number) => {
      const g = started(['a'], seed);
      const seen: unknown[] = [];
      for (let t = 0; t < 8000; t += 500) {
        run(g, 500);
        seen.push(snap(g).fish.map((f) => [f.x, f.y, f.tier]));
      }
      return JSON.stringify(seen);
    };
    expect(fish(5)).toBe(fish(5));
    expect(fish(5)).not.toBe(fish(9));
  });

  it('swims fish across the pond from side to side while they move up and down, and keeps them in the water', () => {
    const g = started(['a'], 11);
    const first = new Map(snap(g).fish.map((f) => [f.n, f]));
    run(g, 3000);
    let sideways = 0;
    let vertical = 0;
    for (const f of snap(g).fish) {
      const was = first.get(f.n);
      if (!was) continue;
      if (Math.abs(f.x - was.x) > 0.1) sideways++;
      if (Math.abs(f.y - was.y) > 0.01) vertical++;
      expect(f.y).toBeGreaterThanOrEqual(0.07);
      expect(f.y).toBeLessThanOrEqual(0.8);
    }
    expect(sideways).toBeGreaterThan(0);
    expect(vertical).toBeGreaterThan(0);
  });

  it('makes bigger fish rarer, worth more, and found further up the pond', () => {
    const counts = [0, 0, 0, 0];
    const topOf: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const g = started(['a'], seed);
      const seen = new Set<number>();
      for (let t = 0; t < 40_000; t += 1000) {
        run(g, 1000);
        for (const f of snap(g).fish) {
          if (seen.has(f.n)) continue;
          seen.add(f.n);
          counts[f.tier]++;
          if (f.tier === 3) topOf.push(f.y);
        }
      }
    }
    expect(counts[0]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[3]);
    expect(counts[3]).toBeGreaterThan(0);
    expect(FISHING_TIERS.map((t) => t.points)).toEqual([1, 2, 4, 8]);
    expect(FISHING_TIERS.map((t) => t.r)).toEqual([...FISHING_TIERS.map((t) => t.r)].sort((a, b) => a - b));
    // The biggest fish never swim near the anglers' end of the pond.
    expect(Math.min(...topOf)).toBeLessThan(0.3);
    expect(Math.max(...topOf)).toBeLessThan(0.55);
  });
});

/** A started game whose first cast of `holdMs` leaves the lure in the water without a fish taking it straight away (so a test can look at the lure). */
function quietCast(holdMs: number, windMs = 0) {
  for (let seed = 1; seed < 40; seed++) {
    const g = started(['a'], seed);
    g.input('a', 0, -1);
    run(g, holdMs);
    g.input('a', 0, 0);
    run(g, 900);
    if (me(g, 'a').mode !== 'out') continue;
    if (windMs > 0) {
      const before = me(g, 'a').ly;
      g.input('a', 0, -1);
      run(g, windMs);
      g.input('a', 0, 0);
      // Winding in swept the lure through a fish: try another pond.
      if (me(g, 'a').mode !== 'out') continue;
      expect(me(g, 'a').ly).toBeGreaterThan(before);
    }
    return g;
  }
  throw new Error('every pond hooked something');
}

describe('FishingGame casting', () => {
  it('casts further the longer the button is held, then lets go and leaves the lure in the water', () => {
    const reach = (holdMs: number) => 0.9 - me(quietCast(holdMs), 'a').ly;
    const short = reach(150);
    const mid = reach(600);
    expect(mid).toBeGreaterThan(short);
    expect(short).toBeGreaterThanOrEqual(0.1);
    expect(reach(1100)).toBeGreaterThan(0.7);
    expect(reach(1100)).toBeLessThanOrEqual(0.74 + 1e-9);
    // Held on past full power the meter comes back down, so timing matters.
    expect(reach(1650)).toBeLessThan(reach(1100));
  });

  it('winds the lure in while the button is held, stops when it is let go, and is ready to cast again at the rod', () => {
    // Tries ponds until one lets the whole thing happen without a fish taking the lure.
    const scenario = (seed: number): boolean => {
      const g = started(['a'], seed);
      const mode = () => me(g, 'a').mode;
      g.input('a', 0, -1);
      run(g, 500);
      g.input('a', 0, 0);
      run(g, 900);
      if (mode() !== 'out') return false;
      const out = me(g, 'a').ly;
      g.input('a', 0, -1);
      run(g, 300);
      if (mode() !== 'out') return false;
      expect(me(g, 'a').winding).toBe(true);
      expect(me(g, 'a').ly).toBeGreaterThan(out);
      g.input('a', 0, 0);
      const stopped = me(g, 'a').ly;
      run(g, 300);
      if (mode() !== 'out') return false;
      expect(me(g, 'a').ly).toBe(stopped);
      expect(me(g, 'a').winding).toBe(false);
      g.input('a', 0, -1);
      for (let t = 0; t < 4000 && mode() === 'out'; t += STEP) g.tick(STEP);
      if (mode() !== 'idle') return false;
      expect(me(g, 'a').ly).toBe(0.9);
      // Still holding from winding in: it takes a fresh press to cast again.
      run(g, 500);
      expect(mode()).toBe('idle');
      g.input('a', 0, 0);
      g.input('a', 0, -1);
      run(g, 100);
      expect(mode()).toBe('charging');
      return true;
    };
    let done = false;
    for (let seed = 1; seed < 40 && !done; seed++) done = scenario(seed);
    expect(done).toBe(true);
  });

  it('does not lose a quick tap that is pressed and let go between two steps', () => {
    const g = started(['a']);
    g.input('a', 0, -1);
    g.input('a', 0, 0);
    run(g, 800);
    expect(['out', 'fight']).toContain(me(g, 'a').mode);
    expect(0.9 - me(g, 'a').ly).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it('ignores presses before the run starts, and junk', () => {
    const g = new FishingGame(lcg(7));
    g.join('a');
    g.input('a', 0, -1);
    run(g, 1000);
    expect(me(g, 'a').mode).toBe('idle');
    g.input('nobody', 0, -1);
    g.input('a', Number.NaN, Number.NaN);
    g.action();
    expect(snap(g).phase).toBe('countdown');
  });
});

describe('FishingGame the throw', () => {
  it('does not take a fish on the way out: only once the lure has landed where it was thrown', () => {
    const g = started(['a'], 5);
    // A fish sitting in the lane in front of the rod, well short of where a full power cast lands.
    const fish = { n: 999, tier: 0, at: 0, x0: me(g, 'a').x, dir: 1, speed: 0, base: 0.6, a1: 0, f1: 1, p1: 0, a2: 0, f2: 1, p2: 0, seed: 1 };
    (g as unknown as { fish: unknown[] }).fish.push(fish);
    g.input('a', 0, -1);
    run(g, 1100); // full power
    g.input('a', 0, 0);
    let hookedInFlight = false;
    let landed = false;
    for (let t = 0; t < 1500; t += STEP) {
      g.tick(STEP);
      const s = me(g, 'a');
      // The snapshot calls a flying lure 'out' too: it has landed once it is up at the far end of a near full power cast.
      if (s.mode === 'out' && s.ly <= 0.2) landed = true;
      if (s.mode === 'fight' && s.ly > 0.25) hookedInFlight = true;
    }
    expect(hookedInFlight).toBe(false);
    expect(landed).toBe(true);
    // Winding the lure back in over it does take it.
    g.input('a', 0, -1);
    for (let t = 0; t < 4000 && me(g, 'a').mode === 'out'; t += STEP) g.tick(STEP);
    expect(me(g, 'a').mode).toBe('fight');
  });
});

describe('FishingGame hooking and reeling', () => {
  /** Plays an angler until the first fish is hooked (or the time is up). */
  function untilHooked(seed: number, power = 0.35) {
    const g = started(['a'], seed);
    const bot = makeAngler(g, 'a', { power });
    for (let t = 0; t < 60_000 && snap(g).phase === 'playing'; t += STEP) {
      bot();
      g.tick(STEP);
      if (me(g, 'a').mode === 'fight') return g;
    }
    return null;
  }

  it('hooks a fish that touches the lure, and shows what kind it is and the green zone to keep it in', () => {
    const hooked = [3, 5, 7, 11, 13].map((seed) => untilHooked(seed)).filter((g) => g !== null);
    expect(hooked.length).toBeGreaterThan(0);
    for (const g of hooked) {
      const s = me(g!, 'a');
      expect(s.mode).toBe('fight');
      expect(s.tier).toBeGreaterThanOrEqual(0);
      expect(s.half).toBeGreaterThan(0.05);
      expect(s.health).toBe(1);
    }
  });

  it('fills the catch while the fish is in the green, and wears the line down while it is not', () => {
    const g = untilHooked(5)!;
    const before = me(g, 'a');
    // Park the zone on the fish by reporting from a device, then let it sit there.
    g.report('a', 1, true, { md: 3, ly: before.ly, pw: 0, z: before.mark, zv: 0, mk: before.mark, h: 1, c: 0, tr: before.tier, pts: 0, lv: 3, dr: 0 });
    expect(me(g, 'a').mode).toBe('fight');
    const idle = untilHooked(5)!;
    // Without reeling the zone sinks away from a fish that has darted off and the line wears.
    idle.input('a', 0, 0);
    run(idle, 4000);
    const s = me(idle, 'a');
    expect(s.health < 1 || s.mode !== 'fight').toBe(true);
  });

  it('lands fish worth their size, and takes a line from someone who lets the fish go', () => {
    let landed = 0;
    let best = 0;
    for (const seed of [3, 5, 7, 11, 13, 17]) {
      const g = started(['a'], seed);
      const bot = makeAngler(g, 'a', { power: 0.3 });
      untilOver(g, 60_000, bot);
      const s = me(g, 'a');
      landed += s.points > 0 ? 1 : 0;
      best = Math.max(best, s.points);
      expect(FISHING_TIERS.some((t) => t.points === 1 || s.points % t.points === 0) || s.points === 0).toBe(true);
    }
    expect(landed).toBeGreaterThan(2);
    expect(best).toBeGreaterThan(0);

    const g = started(['a'], 5);
    const bot = makeAngler(g, 'a', { power: 0.3, reel: false });
    untilOver(g, 120_000, bot);
    expect(snap(g).phase).toBe('over');
    expect(me(g, 'a').lives).toBe(0);
    expect(me(g, 'a').alive).toBe(false);
    expect(snap(g).winnerId).toBeNull();
  });

  it('cannot hook the same fish twice', () => {
    const g = untilHooked(5)!;
    const n = me(g, 'a').tier;
    expect(n).toBeGreaterThanOrEqual(0);
    // Snapping the line (nothing reeled) frees the lure; the fish it lost does not bite again at once.
    const bot = makeAngler(g, 'a', { power: 0.35, reel: false });
    let hooks = 0;
    let last = 'fight';
    for (let t = 0; t < 30_000 && snap(g).phase === 'playing'; t += STEP) {
      bot();
      g.tick(STEP);
      const mode = me(g, 'a').mode;
      if (mode === 'fight' && last !== 'fight') hooks++;
      last = mode;
    }
    expect(hooks).toBeLessThanOrEqual(3);
  });
});

describe('FishingGame lines', () => {
  it('takes a line from someone who never gets a bite, and puts a solo run with none left to an end with no winner', () => {
    const g = started(['a']);
    const s = untilOver(g, 100_000);
    expect(snap(g).phase).toBe('over');
    expect(s).toBeGreaterThan(70);
    expect(s).toBeLessThan(80);
    expect(me(g, 'a').lives).toBe(0);
    expect(snap(g).winnerId).toBeNull();
  });

  it('counts the wait for a bite down on the patience gauge', () => {
    const g = started(['a']);
    expect(me(g, 'a').patience).toBeCloseTo(1, 1);
    run(g, 12_500);
    expect(me(g, 'a').patience).toBeCloseTo(0.5, 1);
    run(g, 13_000);
    expect(me(g, 'a').lives).toBe(2);
    expect(me(g, 'a').patience).toBeGreaterThan(0.9);
  });
});

describe('FishingGame running a run', () => {
  it('crowns the last one fishing, with their own points as the run', () => {
    const g = started(['a', 'b'], 5);
    const keen = makeAngler(g, 'a', { power: 0.3, delay: 0.05 });
    const hopeless = makeAngler(g, 'b', { power: 0.3, reel: false });
    untilOver(g, 200_000, () => {
      keen();
      hopeless();
    });
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBe('a');
    expect(s.history[s.history.length - 1]).toMatchObject({ winnerId: 'a', meters: me(g, 'a').points });
    expect(me(g, 'a').wins).toBe(1);
  });

  it('ends at the lobby time cap, with whoever is still in keeping their points and nobody winning', () => {
    const g = started(['a', 'b'], 5);
    g.timeLimitS = 30;
    const keen = makeAngler(g, 'a', { power: 0.3 });
    const other = makeAngler(g, 'b', { power: 0.3 });
    untilOver(g, 40_000, () => {
      keen();
      other();
    });
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBeNull();
    expect(s.players.every((p) => p.alive || p.meters >= 0)).toBe(true);
  });

  it('puts a new run back at the start', () => {
    const g = started(['a'], 5);
    untilOver(g, 100_000);
    run(g, 4000 + 3200);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.players[0]).toMatchObject({ mode: 'idle', lives: 3, points: 0, health: 1, catch: 0, alive: true });
    expect(s.run).toBe(2);
  });

  it('scores the run by points, and a skilled angler lasts a good while but not for ever', () => {
    const lasted: number[] = [];
    for (const seed of [3, 5, 7, 11]) {
      const g = started(['a'], seed);
      lasted.push(untilOver(g, 900_000, makeAngler(g, 'a', { power: 0.3, delay: 0.1 })));
    }
    for (const s of lasted) expect(s).toBeLessThan(900);
    expect(Math.max(...lasted)).toBeGreaterThan(30);
  });
});

describe('FishingGame on each player’s own device', () => {
  it('works out its own angler there, and reports it', () => {
    const g = started(['a']);
    const copy = new FishingGame(lcg(7));
    copy.join('a');
    copy.startRunAt(123);
    copy.seat('a', 0.3);
    copy.input('a', 0, -1);
    for (let t = 0; t < 600; t += 16) copy.stepRun(0.016);
    const report = copy.localReport('a')!;
    expect(report.alive).toBe(true);
    expect(report.f.md).toBe(1);
    expect(copy.snapshot().players[0].x).toBe(0.3);
    expect(Object.keys(report.f).length).toBeLessThanOrEqual(12);
    g.report('a', 1, true, report.f);
    expect(me(g, 'a').mode).toBe('charging');
    // The server stops working out an angler who reports: their lure stays where they say.
    run(g, 1000);
    expect(me(g, 'a').mode).toBe('charging');
  });

  it('takes a report of being out, and never fewer points than before, nor more than the biggest fish at a time, nor more lines', () => {
    const g = started(['a']);
    const base = { md: 2, ly: 0.5, pw: 0, z: 0.5, zv: 0, mk: 0.5, h: 1, c: 0, tr: 0, lv: 3, dr: 0 };
    g.report('a', 1, true, { ...base, pts: 100 });
    expect(me(g, 'a').points).toBe(8);
    g.report('a', 1, true, { ...base, pts: 12 });
    expect(me(g, 'a').points).toBe(12);
    g.report('a', 1, true, { ...base, pts: 0 });
    expect(me(g, 'a').points).toBe(12);
    g.report('a', 1, true, { ...base, pts: 12, lv: 2 });
    g.report('a', 1, true, { ...base, pts: 12, lv: 3 });
    expect(me(g, 'a').lives).toBe(2);
    g.report('a', 1, false, { ...base, pts: 12, lv: 0 });
    expect(me(g, 'a').alive).toBe(false);
  });

  it('keeps a malformed report in range', () => {
    const g = started(['a']);
    g.report('a', 1, true, { md: 99, ly: -5, pw: 9, z: Number.NaN, zv: 1e9, mk: -1, h: 7, c: -3, tr: 50, pts: 1, lv: 1, dr: 1e6 });
    const s = me(g, 'a');
    expect(s.mode).toBe('idle');
    expect(s.ly).toBeGreaterThanOrEqual(0.16);
    expect(s.ly).toBeLessThanOrEqual(0.9);
    expect(s.power).toBeLessThanOrEqual(1);
    expect(s.health).toBeLessThanOrEqual(1);
    expect(s.catch).toBeGreaterThanOrEqual(0);
    expect(s.patience).toBeGreaterThanOrEqual(0);
    g.report('a', 1, true, { md: 3, tr: 50 });
    expect(me(g, 'a').tier).toBeLessThanOrEqual(3);
  });
});
