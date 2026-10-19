import { describe, expect, it } from 'vitest';
import { STACKER_COLS, STACKER_KEEP_ROWS, STACKER_ROWS } from '../spinLobby.js';
import { StackerGame, lightSpeed, pressTolerance, targetWidth } from './stacker.js';

const STEP = 33;
const run = (g: StackerGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const me = (g: StackerGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new StackerGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until the light is over the target, then returns. False if it never gets there. */
function toTarget(g: StackerGame): boolean {
  for (let i = 0; i < 600; i++) {
    const { target, light } = g.snapshot();
    // Anywhere the press counts, a little in from the edge of that (the light moves up to half a square a tick).
    if (target && light >= target.start - 0.2 && light <= target.start + target.w + 0.2) return true;
    g.tick(STEP);
  }
  return false;
}

/** Ticks until the light is well off the target. */
function toMiss(g: StackerGame): boolean {
  for (let i = 0; i < 600; i++) {
    const { target, light } = g.snapshot();
    if (target && (light < target.start - 0.6 || light > target.start + target.w + 0.6)) return true;
    g.tick(STEP);
  }
  return false;
}

describe('StackerGame', () => {
  it('narrows the target and speeds the light going up, to a floor and a top speed', () => {
    expect(targetWidth(0)).toBe(5);
    expect(targetWidth(2)).toBe(4);
    expect(targetWidth(12)).toBe(2);
    expect(lightSpeed(1)).toBeGreaterThan(lightSpeed(0));
    expect(lightSpeed(100)).toBeLessThanOrEqual(22);
  });

  it('starts with one wide target on the bottom row, and the light moves', () => {
    const g = started(['a']);
    const snap = g.snapshot();
    expect(snap.phase).toBe('playing');
    expect(snap.target!.w).toBe(5);
    expect(snap.target!.start).toBeGreaterThanOrEqual(0);
    expect(snap.target!.start + snap.target!.w).toBeLessThanOrEqual(STACKER_COLS);
    const before = snap.light;
    run(g, 200);
    expect(g.snapshot().light).not.toBe(before);
    expect(g.snapshot().light).toBeGreaterThanOrEqual(0);
    expect(g.snapshot().light).toBeLessThanOrEqual(STACKER_COLS);
  });

  it('locks a row for the first player to press on the target, and everyone moves up', () => {
    const g = started(['a', 'b']);
    expect(toTarget(g)).toBe(true);
    g.action('b', 'stop');
    g.action('a', 'stop'); // together with b: ignored, not judged against the next row
    const snap = g.snapshot();
    expect(snap.locked).toHaveLength(1);
    expect(snap.locked[0].by).toBe(1);
    expect(me(g, 'b').meters).toBe(1);
    expect(me(g, 'a')).toMatchObject({ meters: 0, alive: true });
    expect(snap.target!.w).toBe(5);
  });

  it('knocks out a player whose press misses, and others carry on', () => {
    const g = started(['a', 'b']);
    expect(toMiss(g)).toBe(true);
    g.action('a', 'stop');
    expect(me(g, 'a').alive).toBe(false);
    expect(me(g, 'b').alive).toBe(true);
    expect(g.snapshot().phase).toBe('playing');
    // An out player's presses do nothing.
    expect(toTarget(g)).toBe(true);
    g.action('a', 'stop');
    expect(g.snapshot().locked).toHaveLength(0);
  });

  it('ends a solo run when you miss, with no winner and your rows as the score', () => {
    const g = started(['a']);
    expect(toTarget(g)).toBe(true);
    g.action('a', 'stop');
    run(g, 500); // past the short wait after a lock
    expect(toMiss(g)).toBe(true);
    g.action('a', 'stop');
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
    expect(g.snapshot().history.at(-1)?.meters).toBe(1);
  });

  it('gives the run to whoever locked the most rows when everyone is out', () => {
    const g = started(['a', 'b']);
    expect(toTarget(g)).toBe(true);
    g.action('a', 'stop');
    run(g, 500);
    expect(toMiss(g)).toBe(true);
    g.action('a', 'stop');
    expect(g.snapshot().phase).toBe('playing'); // b is still in
    g.action('b', 'stop');
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: 'a' });
    expect(me(g, 'a').wins).toBe(1);
  });

  it('has no winner on a tie, and ignores other actions, and people only watching', () => {
    const g = started(['a', 'b']);
    g.join('late');
    g.action('late', 'stop');
    g.action('a', 'jump');
    expect(g.snapshot().players.find((p) => p.id === 'late')!.alive).toBe(false);
    expect(toMiss(g)).toBe(true);
    g.action('a', 'stop');
    g.action('b', 'stop');
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('has no top: the tower goes on past the height of the view, and the view scrolls up with it', () => {
    const g = started(['a']);
    const climb = STACKER_ROWS + 6;
    for (let row = 0; row < climb; row++) {
      expect(toTarget(g), `row ${row}`).toBe(true);
      g.action('a', 'stop');
      run(g, 500);
    }
    const snap = g.snapshot();
    expect(snap.phase).toBe('playing');
    expect(me(g, 'a').meters).toBe(climb);
    // Only the rows in view are sent, with how many are below them.
    expect(snap.locked).toHaveLength(STACKER_KEEP_ROWS);
    expect(snap.first).toBe(climb - STACKER_KEEP_ROWS);
    expect(snap.target).not.toBeNull();
  });

  it('keeps getting faster all the way up, past the early climb, to a top speed', () => {
    // Quick at first (6.5 to 12 squares a second by about row 8), then still faster every row, more slowly.
    expect(lightSpeed(0)).toBe(6.5);
    expect(lightSpeed(8)).toBeCloseTo(12, 0);
    let last = lightSpeed(0);
    for (let row = 1; row <= 32; row++) {
      const speed = lightSpeed(row);
      expect(speed, `row ${row}`).toBeGreaterThan(last);
      last = speed;
    }
    expect(lightSpeed(20)).toBeGreaterThan(lightSpeed(10));
    expect(lightSpeed(30)).toBeGreaterThan(lightSpeed(20));
    expect(lightSpeed(34)).toBe(22);
    expect(lightSpeed(60)).toBe(22);
  });

  it('moves the light further each second the higher the tower is', () => {
    const lightAfter = (rows: number) => {
      const g = started(['a'], 0.4);
      for (let row = 0; row < rows; row++) {
        expect(toTarget(g)).toBe(true);
        g.action('a', 'stop');
        run(g, 500);
      }
      const before = g.snapshot().light;
      // The distance the light covers in one second, unwrapped (it bounces, so take small steps).
      let travelled = 0;
      let prev = before;
      for (let t = 0; t < 1000; t += STEP) {
        g.tick(STEP);
        const now = g.snapshot().light;
        travelled += Math.abs(now - prev);
        prev = now;
      }
      return travelled;
    };
    const low = lightAfter(2);
    const mid = lightAfter(12);
    const high = lightAfter(24);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it('gives a fast light a wider margin, so it is not judged more harshly than a slow one', () => {
    expect(pressTolerance(0)).toBeCloseTo(0.3, 9);
    expect(pressTolerance(30)).toBeGreaterThan(pressTolerance(0));
    // Always at least what the light covers in a little under half a 66 ms tick.
    for (const row of [0, 8, 16, 24, 34]) expect(pressTolerance(row)).toBeGreaterThanOrEqual(lightSpeed(row) * 0.03 - 1e-9);
  });

  it('stacks each row on the one below it: a narrower row sits within it, an equal one shifts by at most a square', () => {
    for (const seed of [0.05, 0.2, 0.33, 0.5, 0.62, 0.77, 0.9, 0.99]) {
      const g = started(['a'], seed);
      const rows: { start: number; w: number }[] = [];
      for (let row = 0; row < 24; row++) {
        expect(toTarget(g), `seed ${seed} row ${row}`).toBe(true);
        rows.push({ ...g.snapshot().target! });
        g.action('a', 'stop');
        run(g, 500);
      }
      rows.forEach((r, i) => {
        expect(r.start, `seed ${seed} row ${i}`).toBeGreaterThanOrEqual(0);
        expect(r.start + r.w, `seed ${seed} row ${i}`).toBeLessThanOrEqual(STACKER_COLS);
        if (i === 0) return;
        const below = rows[i - 1];
        const overlap = Math.min(r.start + r.w, below.start + below.w) - Math.max(r.start, below.start);
        if (r.w < below.w) expect(overlap, `seed ${seed} row ${i} inside`).toBe(r.w);
        else expect(Math.abs(r.start - below.start), `seed ${seed} row ${i} shift`).toBeLessThanOrEqual(r.w >= 2 ? 1 : 0);
        expect(overlap, `seed ${seed} row ${i} touches`).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it('gets narrower still very high up, to a single square', () => {
    expect(targetWidth(17)).toBe(2);
    expect(targetWidth(18)).toBe(1);
    expect(targetWidth(60)).toBe(1);
  });

  it('keeps every row until the end of the run for the score, however many are in view', () => {
    const g = started(['a']);
    for (let row = 0; row < 14; row++) {
      expect(toTarget(g)).toBe(true);
      g.action('a', 'stop');
      run(g, 500);
    }
    expect(toMiss(g)).toBe(true);
    g.action('a', 'stop');
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().history.at(-1)?.meters).toBe(14);
  });

  it('ends when nobody has pressed the button for 20 seconds, so an idle lobby moves on', () => {
    const g = started(['a', 'b']);
    run(g, 19_000);
    expect(g.snapshot().phase).toBe('playing');
    run(g, 2000);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('keeps going while someone is pressing, and ends at a lobby\'s time limit even so', () => {
    const g = started(['a', 'b']);
    g.timeLimitS = 300;
    // A press on the target every 10 seconds keeps the run alive, for 250 seconds.
    for (let t = 0; t < 250_000 && g.snapshot().phase === 'playing'; t += 10_000) {
      expect(toTarget(g)).toBe(true);
      g.action('a', 'stop');
      run(g, 10_000);
    }
    expect(g.snapshot().phase).toBe('playing');
    // Still pressing past that, it ends at 5 minutes whatever (a second at a time, so as not to step over the result).
    for (let t = 0; t < 80_000 && g.snapshot().phase === 'playing'; t += 1000) {
      if (t % 10_000 === 0) {
        expect(toTarget(g)).toBe(true);
        g.action('a', 'stop');
      }
      run(g, 1000);
    }
    expect(g.snapshot().phase).not.toBe('playing');
  });

  it('plays the same tower for the same seed', () => {
    const towerOf = (seed: number) => {
      const g = started(['a'], seed);
      const targets: number[] = [];
      for (let row = 0; row < 4; row++) {
        targets.push(g.snapshot().target!.start);
        expect(toTarget(g)).toBe(true);
        g.action('a', 'stop');
        run(g, 500);
      }
      return targets;
    };
    expect(towerOf(0.4)).toEqual(towerOf(0.4));
  });
});
