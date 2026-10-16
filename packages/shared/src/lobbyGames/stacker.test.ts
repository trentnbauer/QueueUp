import { describe, expect, it } from 'vitest';
import { STACKER_COLS, STACKER_KEEP_ROWS, STACKER_ROWS } from '../spinLobby.js';
import { StackerGame, lightSpeed, targetWidth } from './stacker.js';

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
    expect(lightSpeed(100)).toBeLessThanOrEqual(12);
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

  it('ends when time is up even if the light is never stopped', () => {
    const g = started(['a', 'b']);
    run(g, 301_000);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
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
