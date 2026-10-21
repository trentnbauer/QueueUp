import { describe, expect, it } from 'vitest';
import { SWING_REACH, SWING_START_X } from '../spinLobby.js';
import { SwingGame, wallAt } from './swing.js';

const STEP = 33;
const run = (g: SwingGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: SwingGame) => g.snapshot();
const me = (g: SwingGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new SwingGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays until the run is over (or `ms` is up), and says how long it lasted in seconds. */
function untilOver(g: SwingGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

interface Inside {
  players: Map<string, { x: number; y: number; vx: number; vy: number; a: number; last: number; len: number; th: number; w: number; dir: number }>;
  anchors: { n: number; x: number; y: number }[];
}

const G = 2.2;

/** A swinger who pumps the way the swing is going and lets go when a throw from there would reach a further anchor, and grabs when it falls toward one:
 * `late` is how many seconds it is slow to press. */
function makeSwinger(g: SwingGame, id: string, { late = 0 }: { late?: number } = {}) {
  const inside = g as unknown as Inside;
  let wait = 0;
  return () => {
    const p = inside.players.get(id)!;
    if (snap(g).phase !== 'playing' || !me(g, id).alive) return;
    const reachable = (x: number, y: number) => inside.anchors.find((a) => a.n > p.last && a.y < y - 0.03 && (a.x - x) ** 2 + (a.y - y) ** 2 < (SWING_REACH - 0.02) ** 2);
    if (p.a >= 0) {
      g.input(id, Math.abs(p.w) < 0.2 ? 1 : Math.sign(p.w), 0);
      // Would a throw from here reach one? Fly it forward and look.
      let { x, y, vx, vy } = { x: p.x, y: p.y, vx: p.len * p.w * Math.cos(p.th), vy: -p.len * p.w * Math.sin(p.th) };
      let ok = false;
      for (let i = 0; i < 120 && y < 1; i++) {
        vy += G / 60;
        x += vx / 60;
        y += vy / 60;
        if (vy > 0 && reachable(x, y)) {
          ok = true;
          break;
        }
      }
      if ((ok && p.w > 0) || reachable(p.x, p.y)) {
        wait += STEP / 1000;
        if (wait >= late) {
          g.action(id, 'grab');
          wait = 0;
        }
      } else wait = 0;
    } else {
      g.input(id, 0, 0);
      if (reachable(p.x, p.y)) {
        wait += STEP / 1000;
        if (wait >= late) {
          g.action(id, 'grab');
          wait = 0;
        }
      }
    }
  };
}

const inside = (g: SwingGame) => g as unknown as Inside;

describe('wallAt', () => {
  it('starts behind the first anchor, and goes faster and faster with no top speed', () => {
    expect(wallAt(0)).toBeLessThan(SWING_START_X);
    const speed = (t: number) => wallAt(t + 1) - wallAt(t);
    expect(speed(10)).toBeGreaterThan(speed(0));
    expect(speed(300)).toBeGreaterThan(speed(100) + 1);
  });
});

describe('SwingGame', () => {
  it('starts everyone hanging from the first anchor, swung back, and the swing takes them forward by itself', () => {
    const g = started(['a', 'b']);
    const first = inside(g).anchors[0];
    for (const id of ['a', 'b']) {
      const p = inside(g).players.get(id)!;
      expect(p.a).toBe(0);
      expect(p.x).toBeLessThan(first.x + 0.2);
    }
    const x0 = me(g, 'a').x;
    run(g, 800);
    expect(me(g, 'a').x).toBeGreaterThan(x0 + 0.2);
    expect(me(g, 'a').y).toBeGreaterThan(first.y);
  });

  it('lets pumping build the swing up, past what it does alone', () => {
    const highest = (dir: number) => {
      const g = started(['a']);
      g.input('a', dir, 0);
      let top = 0;
      for (let t = 0; t < 2400; t += STEP) {
        if (dir !== 0) g.input('a', Math.sign(inside(g).players.get('a')!.w) || 1, 0);
        g.tick(STEP);
        top = Math.max(top, Math.abs(inside(g).players.get('a')!.th));
      }
      return top;
    };
    expect(highest(1)).toBeGreaterThan(highest(0) + 0.3);
  });

  it('lets go on a press, throws the way the swing was going, and pulls down in the air', () => {
    const g = started(['a']);
    run(g, 700);
    g.action('a', 'grab');
    const p = inside(g).players.get('a')!;
    expect(p.a).toBe(-1);
    expect(p.vx).toBeGreaterThan(0.2);
    const vy = p.vy;
    run(g, 200);
    expect(p.vy).toBeGreaterThan(vy);
    expect(me(g, 'a').a).toBe(-1);
  });

  it('puts a swinger out who falls off the bottom, and ends a solo run with no winner', () => {
    const g = started(['a']);
    run(g, 700);
    g.action('a', 'grab'); // let go and never grab
    const s = untilOver(g, 60_000);
    expect(snap(g).phase).toBe('over');
    expect(s).toBeLessThan(6);
    expect(me(g, 'a').alive).toBe(false);
    expect(snap(g).winnerId).toBeNull();
  });

  it('grabs the nearest anchor ahead that is above and within reach, never one already held, and nothing when there is none', () => {
    const g = started(['a']);
    const p = inside(g).players.get('a')!;
    // In the air under the second anchor, close enough.
    const a1 = inside(g).anchors[1];
    g.action('a', 'grab'); // let go of the first
    p.x = a1.x - 0.05;
    p.y = a1.y + 0.2;
    p.vx = 0;
    p.vy = 0;
    g.action('a', 'grab');
    expect(p.a).toBe(1);
    expect(p.last).toBe(1);
    // Let go and try to go back to the first: it is behind.
    g.action('a', 'grab');
    p.x = inside(g).anchors[0].x;
    p.y = inside(g).anchors[0].y + 0.1;
    g.action('a', 'grab');
    expect(p.a).toBe(-1);
    // Too far from any anchor.
    p.x = a1.x + 0.1;
    p.y = 0.95;
    g.action('a', 'grab');
    expect(p.a).toBe(-1);
  });

  it('lays the same anchors for the same seed, getting further apart, and others for another', () => {
    const anchors = (seed: number) => {
      const g = started(['a'], seed);
      const p = inside(g).players.get('a')!;
      p.x = 40; // lay a long way on
      g.tick(STEP);
      return inside(g).anchors;
    };
    expect(JSON.stringify(anchors(5))).toBe(JSON.stringify(anchors(5)));
    expect(JSON.stringify(anchors(5))).not.toBe(JSON.stringify(anchors(9)));
    const a = anchors(5);
    const gaps = a.slice(1).map((x, i) => x.x - a[i].x);
    expect(gaps.length).toBeGreaterThan(40);
    expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0] + 0.3);
    for (const x of a) {
      expect(x.y).toBeGreaterThanOrEqual(0.05);
      expect(x.y).toBeLessThanOrEqual(0.19);
    }
  });

  it('catches a swinger who only swings in place, with the wall', () => {
    const g = started(['a']);
    g.input('a', 1, 0);
    const s = untilOver(g, 60_000, () => g.input('a', Math.sign(inside(g).players.get('a')!.w) || 1, 0));
    expect(snap(g).phase).toBe('over');
    expect(s).toBeLessThan(15);
  });

  it('lets a swinger who hands over from anchor to anchor last a good while, and the wall gets everyone in the end', () => {
    const lasted: number[] = [];
    for (const seed of [3, 5, 7, 11]) {
      const g = started(['a'], seed);
      lasted.push(untilOver(g, 900_000, makeSwinger(g, 'a')));
    }
    for (const s of lasted) expect(s).toBeLessThan(900);
    expect(Math.min(...lasted)).toBeGreaterThan(30);
    // Someone a third of a second slow to press does worse.
    const late = [3, 5, 7, 11].map((seed) => {
      const g = started(['a'], seed);
      return untilOver(g, 900_000, makeSwinger(g, 'a', { late: 0.35 }));
    });
    expect(Math.max(...late)).toBeLessThan(Math.min(...lasted));
  });

  it('crowns the last one swinging, with their own metres as the run', () => {
    const g = started(['a', 'b'], 5);
    const keen = makeSwinger(g, 'a');
    untilOver(g, 900_000, keen);
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(s.history.at(-1)).toMatchObject({ winnerId: 'a', meters: me(g, 'a').meters });
    expect(me(g, 'a').meters).toBeGreaterThan(me(g, 'b').meters);
  });

  it('ends at the lobby time cap, with whoever is still in keeping their metres and nobody winning', () => {
    const g = started(['a', 'b'], 5);
    g.timeLimitS = 20;
    const one = makeSwinger(g, 'a');
    const two = makeSwinger(g, 'b');
    untilOver(g, 60_000, () => {
      one();
      two();
    });
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBeNull();
    expect(s.meters).toBeGreaterThan(0);
  });

  it('puts a new run back at the start', () => {
    const g = started(['a'], 5);
    untilOver(g, 60_000);
    run(g, 4000 + 3200);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.run).toBe(2);
    expect(inside(g).players.get('a')).toMatchObject({ a: 0, last: 0 });
    expect(s.anchors[0].n).toBeLessThanOrEqual(1);
  });
});

describe('SwingGame on each player’s own device', () => {
  it('works out its own swinger there, and reports it', () => {
    const g = started(['a']);
    const copy = new SwingGame(lcg(7));
    copy.join('a');
    copy.startRunAt(123);
    copy.input('a', 1, 0);
    for (let t = 0; t < 700; t += 16) copy.stepRun(0.016);
    copy.action('a', 'grab');
    const report = copy.localReport('a')!;
    expect(report.alive).toBe(true);
    expect(report.f.a).toBe(-1);
    expect(report.f.vx).toBeGreaterThan(0);
    expect(Object.keys(report.f).length).toBeLessThanOrEqual(12);
    g.report('a', 1, true, report.f);
    expect(me(g, 'a').a).toBe(-1);
    expect(me(g, 'a').x).toBeCloseTo(report.f.x, 2);
    // The server stops working out a swinger who reports: they stay where they say.
    run(g, 100);
    expect(me(g, 'a').x).toBeCloseTo(report.f.x, 2);
  });

  it('takes a report of being out, and keeps a malformed report in range', () => {
    const g = started(['a']);
    g.report('a', 1, true, { x: 1e9, y: -50, vx: 1e9, vy: -1e9, a: 9e9, l: -5, th: 9, w: 9, b: 1e12, lt: -3 });
    const p = inside(g).players.get('a')!;
    expect(p.x).toBeLessThanOrEqual(1e4);
    expect(p.y).toBeGreaterThanOrEqual(-2);
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(20);
    expect(p.len).toBeGreaterThanOrEqual(0.2);
    expect(p.len).toBeLessThanOrEqual(SWING_REACH);
    expect(Math.abs(p.th)).toBeLessThanOrEqual(1.4);
    expect(Math.abs(p.w)).toBeLessThanOrEqual(3);
    g.report('a', 1, false, { x: 1, y: 0.5, vx: 0, vy: 0, a: -1, l: 0.3, th: 0, w: 0, b: 1, lt: 0 });
    expect(me(g, 'a').alive).toBe(false);
  });
});

