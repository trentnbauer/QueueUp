import { describe, expect, it } from 'vitest';
import { FROGGER_CAR_MARGIN, FROGGER_FROG_W, FROGGER_ROWS_VISIBLE, FROGGER_ROW_H, type FroggerSnapshot } from '../spinLobby.js';
import { FroggerGame } from './frogger.js';

const STEP = 33;
const run = (g: FroggerGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: FroggerGame) => g.snapshot();
const me = (g: FroggerGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new FroggerGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays until the run is over (or `ms` is up), and says how long it lasted in seconds. */
function untilOver(g: FroggerGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

// ---- A player who can see the traffic -----------------------------------------------------------------------

const LOOP = 1 + 2 * FROGGER_CAR_MARGIN;
const BOT_STEP_MS = 120;
const CELL = 0.06;
const HORIZON = 10;

/** Where a car is `after` seconds from now, given where it is now and how fast it drives. */
function carAt(x0: number, v: number, after: number): number {
  const at = (((x0 + FROGGER_CAR_MARGIN + v * after) % LOOP) + LOOP) % LOOP;
  return at - FROGGER_CAR_MARGIN;
}

/** Whether a hopper standing at `x` on row `row` at `after` seconds from now is hit. */
function hitAt(s: FroggerSnapshot, row: number, x: number, after: number): boolean {
  const lane = s.rows.find((r) => r.r === row);
  if (!lane || lane.kind !== 'road') return false;
  return lane.cars.some((c) => Math.abs(carAt(c, lane.v, after) - x) < (lane.w + FROGGER_FROG_W) / 2 + 0.01);
}

/** Looks a second or so ahead for a way through the traffic that gets up the most rows (a step is a hop, or one cell left or
 * right, or a wait) and makes the first move of it. Moves to cells a step apart, so it only needs to be right at each cell. */
function wiseStep(g: FroggerGame, id: string, hopOnly = false) {
  const s = snap(g);
  const p = me(g, id);
  const h = BOT_STEP_MS / 1000;
  const top = Math.floor(s.edge / FROGGER_ROW_H + 1e-9) + FROGGER_ROWS_VISIBLE - 1;
  type Node = { row: number; x: number; first: 'hop' | 'left' | 'right' | 'stay' | null };
  const keyOf = (row: number, x: number) => `${row}:${Math.round(x / 0.02)}`;
  let layer = new Map<string, Node>([[keyOf(p.row, p.x), { row: p.row, x: p.x, first: null }]]);
  for (let k = 0; k < HORIZON; k++) {
    const next = new Map<string, Node>();
    for (const n of layer.values()) {
      const moves: { row: number; x: number; act: 'hop' | 'left' | 'right' | 'stay' }[] = [{ row: n.row, x: n.x, act: 'stay' }];
      if (n.row + 1 <= top) moves.push({ row: n.row + 1, x: n.x, act: 'hop' });
      if (!hopOnly) {
        if (n.x > 0) moves.push({ row: n.row, x: Math.max(0, n.x - CELL), act: 'left' });
        if (n.x < 1) moves.push({ row: n.row, x: Math.min(1, n.x + CELL), act: 'right' });
      }
      for (const m of moves) {
        const t0 = k * h;
        const x0 = n.x;
        const x1 = m.x;
        if (hitAt(s, m.row, x1, t0 + h) || hitAt(s, m.row, (x0 + x1) / 2, t0 + h / 2) || (m.act === 'hop' && hitAt(s, m.row, x0, t0))) continue;
        // Under the bottom edge by then: out.
        if ((m.row + 1) * FROGGER_ROW_H <= s.edge + s.speed * (t0 + h)) continue;
        const key = keyOf(m.row, m.x);
        if (!next.has(key)) next.set(key, { row: m.row, x: m.x, first: n.first ?? m.act });
      }
    }
    if (next.size === 0) break;
    layer = next;
  }
  let best: Node | null = null;
  for (const n of layer.values()) if (!best || n.row > best.row || (n.row === best.row && Math.abs(n.x - 0.5) < Math.abs(best.x - 0.5))) best = n;
  const act = best?.first ?? 'stay';
  g.input(id, act === 'left' ? -1 : act === 'right' ? 1 : 0, 0);
  if (act === 'hop') g.action(id, 'hop');
}

/** Plays like `wiseStep` for the length of a bot step, then lets the game run that long. */
function playWise(g: FroggerGame, id: string, ms: number, hopOnly = false) {
  for (let t = 0; t < ms && snap(g).phase === 'playing' && me(g, id).alive; t += BOT_STEP_MS) {
    wiseStep(g, id, hopOnly);
    g.tick(BOT_STEP_MS);
  }
}

describe('FroggerGame course', () => {
  it('starts everyone on grass, with the first road a row above, and lays a few rows past the top of the screen', () => {
    const g = started(['a']);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.rows[0]).toMatchObject({ r: 0, kind: 'grass' });
    expect(s.rows.find((r) => r.r === me(g, 'a').row)?.kind).toBe('grass');
    expect(s.rows.find((r) => r.r === me(g, 'a').row + 1)?.kind).toBe('road');
    expect(Math.max(...s.rows.map((r) => r.r))).toBeGreaterThan(FROGGER_ROWS_VISIBLE);
  });

  it('is the same road for the same seed, and a different one for another', () => {
    const rows = (seed: number) => JSON.stringify(snap(started(['a'], seed)).rows);
    expect(rows(5)).toBe(rows(5));
    expect(rows(5)).not.toBe(rows(9));
  });

  it('leaves a gap on every road row that a hopper fits in, with a grass row to rest on now and then', () => {
    for (const seed of [3, 7, 11, 19]) {
      const g = started(['a'], seed);
      run(g, 2000);
      // Climb a long way up the course without being hurt, by playing it, and look at every row laid.
      playWise(g, 'a', 40_000);
      const rows = snap(g).rows;
      for (const row of rows.filter((r) => r.kind === 'road')) {
        const sorted = [...row.cars].sort((a, b) => a - b);
        for (let i = 0; i < sorted.length; i++) {
          const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + LOOP;
          expect(next - sorted[i] - row.w, `seed ${seed} row ${row.r}`).toBeGreaterThan(FROGGER_FROG_W + 0.1);
        }
      }
      expect(rows.some((r) => r.kind === 'grass' && r.r > 3) || snap(g).edge > 0).toBe(true);
    }
  });

  it('has cars that wrap round off screen and move at the speed a row says', () => {
    const g = started(['a']);
    const before = snap(g).rows.find((r) => r.kind === 'road')!;
    run(g, 330);
    const after = snap(g).rows.find((r) => r.r === before.r)!;
    expect(after.cars[0]).toBeCloseTo(carAt(before.cars[0], before.v, 0.33), 1);
  });

  it('does not show the road moving before the run starts', () => {
    const g = new FroggerGame(lcg(7));
    g.join('a');
    const before = JSON.stringify(snap(g).rows);
    run(g, 1500);
    expect(snap(g).phase).toBe('countdown');
    expect(JSON.stringify(snap(g).rows)).toBe(before);
  });
});

describe('FroggerGame hopping', () => {
  it('goes up one row a hop, then waits a moment before the next', () => {
    const g = started(['a']);
    const row = me(g, 'a').row;
    g.action('a', 'hop');
    expect(me(g, 'a').row).toBe(row + 1);
    g.action('a', 'hop');
    expect(me(g, 'a').row).toBe(row + 1);
    run(g, 200);
  });

  it('slides left and right and stays on the screen', () => {
    const g = started(['a']);
    g.input('a', 1, 0);
    run(g, 1200);
    expect(me(g, 'a').x).toBe(1);
    const h = started(['a']);
    h.input('a', -1, 0);
    run(h, 1200);
    expect(me(h, 'a').x).toBe(0);
  });

  it('ignores junk and anything before the run starts', () => {
    const g = new FroggerGame(lcg(7));
    g.join('a'); // countdown
    g.input('a', 1, 0);
    g.action('a', 'hop');
    run(g, 1000);
    expect(me(g, 'a').row).toBe(2);
    expect(me(g, 'a').x).toBe(0.5);
    const p = started(['a']);
    p.action('a', 'jump');
    expect(me(p, 'a').row).toBe(2);
    p.input('a', 99, 0);
    const before = me(p, 'a').x;
    run(p, 200);
    expect(me(p, 'a').x).toBe(before);
  });

  it('cannot hop past the top of the screen until the screen has moved up', () => {
    const g = started(['a']);
    const top = Math.floor(snap(g).edge / FROGGER_ROW_H) + FROGGER_ROWS_VISIBLE - 1;
    for (let i = 0; i < 30; i++) {
      g.action('a', 'hop');
      g.tick(150);
      if (!me(g, 'a').alive) break;
    }
    expect(me(g, 'a').row).toBeLessThanOrEqual(top + Math.ceil(snap(g).edge / FROGGER_ROW_H));
  });
});

describe('FroggerGame running a run', () => {
  it('knocks out a hopper who stands still, and ends a solo run with no winner', () => {
    const g = started(['a']);
    const seconds = untilOver(g, 60_000);
    expect(seconds).toBeLessThan(15);
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: null });
    expect(me(g, 'a').alive).toBe(false);
  });

  it('sweeps away anyone the bottom edge passes, however they got there', () => {
    const g = started(['a']);
    g.input('a', 1, 0); // out of the way of anything on the starting row (grass), and still
    const seconds = untilOver(g, 60_000);
    // 3 rows of grass below the start at 0.08 of the screen a second and rising: about 3.3 seconds.
    expect(seconds).toBeGreaterThan(3);
    expect(seconds).toBeLessThan(8);
  });

  it('rises quicker as the run goes on, to a limit', () => {
    const g = started(['a']);
    const start = snap(g).speed;
    playWise(g, 'a', 40_000);
    expect(snap(g).speed).toBeGreaterThan(start);
    expect(snap(g).speed).toBeLessThanOrEqual(0.26);
  });

  it('lets a hopper who reads the traffic last 20 seconds, on several roads (and not for ever: it ends for everyone)', () => {
    for (const seed of [3, 7, 11, 19, 23]) {
      const g = started(['a'], seed);
      playWise(g, 'a', 20_000);
      expect(me(g, 'a').alive, `seed ${seed}: out at ${snap(g).meters} m`).toBe(true);
      expect(me(g, 'a').row).toBeGreaterThan(25);
    }
    // Even someone who sees every car ends: the edge and the traffic only get quicker.
    const g = started(['a'], 3);
    expect(untilOver(g, 120_000, () => wiseStep(g, 'a'))).toBeLessThan(90);
  });

  it('knocks out a hopper who only mashes hop and never dodges', () => {
    let survived = 0;
    for (const seed of [3, 7, 11, 19, 23]) {
      const g = started(['a'], seed);
      if (untilOver(g, 30_000, () => g.action('a', 'hop')) >= 30) survived++;
    }
    expect(survived).toBe(0);
  });

  it('counts a run in metres, two a row, and gives a winner their own', () => {
    const g = started(['a', 'b']);
    // a plays; b stays on the grass until swept away
    let rowsA = 0;
    untilOver(g, 60_000, () => {
      if (me(g, 'a').alive) wiseStep(g, 'a');
      rowsA = me(g, 'a').row;
    });
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBe('a');
    expect(s.history.at(-1)?.meters).toBe((me(g, 'a').row - 2) * 2);
    expect(rowsA).toBeGreaterThan(2);
  });

  it('lets a lone winner have a score of zero rows without crashing', () => {
    const g = started(['a', 'b']);
    untilOver(g, 60_000);
    expect(snap(g).phase).toBe('over');
  });

  it('ends at the lobby time cap, with whoever is still in keeping their rows and nobody winning', () => {
    const g = new FroggerGame(lcg(7));
    g.timeLimitS = 10;
    g.join('a');
    run(g, 3200);
    playWise(g, 'a', 12_000);
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBeNull();
    expect(s.history.at(-1)?.meters).toBeGreaterThan(0);
  });

  it('puts a new run back at the start, in the same spots', () => {
    const g = started(['a', 'b']);
    const spots = snap(g).players.map((p) => p.x);
    untilOver(g, 60_000);
    run(g, 4200 + 3300);
    expect(snap(g).players.map((p) => p.x)).toEqual(spots);
    expect(snap(g).players.map((p) => p.row)).toEqual([2, 2]);
    expect(snap(g).edge).toBeLessThan(0.1);
  });
});

describe('FroggerGame on each player’s own device', () => {
  it('works out its own hopper there, and reports it', () => {
    const g = started(['a']);
    expect(g.clientSim).toBe(true);
    g.report('a', 1, true, { x: 0.8, row: 3 });
    expect(me(g, 'a')).toMatchObject({ x: 0.8, row: 3, alive: true });
    // A hopper that reports is not moved by the server, and its hops there are not counted twice.
    g.action('a', 'hop');
    g.input('a', -1, 0);
    run(g, 500);
    expect(me(g, 'a')).toMatchObject({ x: 0.8, row: 3 });
  });

  it('takes a report of being out, and never takes a hopper back down a row or far up one', () => {
    const g = started(['a']);
    g.report('a', 1, true, { x: 0.5, row: 4 });
    g.report('a', 1, true, { x: 0.5, row: 1 });
    expect(me(g, 'a').row).toBe(4);
    g.report('a', 1, true, { x: 0.5, row: 99 });
    expect(me(g, 'a').row).toBe(7);
    g.report('a', 1, false, {});
    expect(me(g, 'a').alive).toBe(false);
  });

  it('still sweeps away a hopper whose device reports a low row', () => {
    const g = started(['a']);
    const report = () => g.report('a', 1, true, { x: 0.5, row: 2 });
    const seconds = untilOver(g, 30_000, report);
    expect(seconds).toBeLessThan(8);
    expect(me(g, 'a').alive).toBe(false);
  });

  it('ignores a malformed report', () => {
    const g = started(['a']);
    g.report('a', 1, true, { x: Number.NaN, row: Number.POSITIVE_INFINITY });
    expect(Number.isFinite(me(g, 'a').x)).toBe(true);
    expect(Number.isFinite(me(g, 'a').row)).toBe(true);
  });
});
