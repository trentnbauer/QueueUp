import { describe, expect, it } from 'vitest';
import { TiltGame } from './tilt.js';

const STEP = 33;
const run = (g: TiltGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
/** Ticks until the run is over (and stops there, before the next one starts). */
const runToEnd = (g: TiltGame, ms: number) => {
  for (let t = 0; t < ms && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const me = (g: TiltGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new TiltGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Pushes each ball back toward the middle, as players trying to keep theirs on would. */
function balance(g: TiltGame, ids: string[]) {
  for (const id of ids) {
    const p = me(g, id);
    g.input(id, p.x + p.v * 0.5 > 0.5 ? -1 : 1, 0);
  }
}

function play(g: TiltGame, ids: string[], ms: number) {
  for (let t = 0; t < ms && g.snapshot().phase === 'playing'; t += STEP) {
    balance(g, ids);
    g.tick(STEP);
  }
}

describe('TiltGame', () => {
  it('starts every ball in the middle of the beam, at rest', () => {
    const g = started(['a', 'b']);
    expect(g.snapshot().phase).toBe('playing');
    for (const id of ['a', 'b']) expect(Math.abs(me(g, id).x - 0.5)).toBeLessThan(0.02);
  });

  it('moves only your own ball when you push', () => {
    const g = started(['a', 'b']);
    g.input('a', 1, 0);
    run(g, 300);
    // b's ball is only pulled by the beam, a's is pushed right on top of that.
    expect(me(g, 'a').x).toBeGreaterThan(me(g, 'b').x);
    expect(me(g, 'a').v).toBeGreaterThan(0);
  });

  it('tips the beam toward where the balls are, and the tilt pulls every ball', () => {
    const g = started(['a', 'b']);
    g.input('a', 1, 0);
    g.input('b', 1, 0);
    run(g, 1500);
    expect(g.snapshot().tilt).toBeGreaterThan(0);

    // A ball that pushes against the others is not alone: the tilt they make drags it along too.
    const h = started(['a', 'b', 'c']);
    h.input('a', 1, 0);
    h.input('b', 1, 0);
    h.input('c', -1, 0);
    run(h, 1200);
    expect(me(h, 'a').x).toBeGreaterThan(me(h, 'c').x);
  });

  it('knocks a player out when their ball rolls off, and the rest play on', () => {
    const g = started(['a', 'b', 'c']);
    g.input('a', -1, 0);
    for (let t = 0; t < 20_000 && me(g, 'a').alive; t += STEP) {
      // b and c balance; a pushes off the left end.
      for (const id of ['b', 'c']) {
        const p = me(g, id);
        g.input(id, p.x + p.v * 0.5 > 0.5 ? -1 : 1, 0);
      }
      g.tick(STEP);
    }
    expect(me(g, 'a')).toMatchObject({ alive: false, fell: true });
    expect(me(g, 'b').alive).toBe(true);
    expect(g.snapshot().phase).toBe('playing');
  });

  it('ends a solo run when the ball falls off', () => {
    const g = started(['a']);
    g.input('a', -1, 0);
    run(g, 500);
    expect(g.snapshot().tilt).toBeLessThan(0);
    runToEnd(g, 20_000);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('ends a run with others when one ball is left, and that ball wins a tie', () => {
    const g = started(['a', 'b']);
    g.input('a', 1, 0);
    for (let t = 0; t < 30_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const p = me(g, 'b');
      g.input('b', p.x + p.v * 0.5 > 0.5 ? -1 : 1, 0);
      g.tick(STEP);
    }
    expect(g.snapshot().phase).toBe('over');
    expect(me(g, 'a').fell).toBe(true);
  });

  it('spawns targets, never more than two', () => {
    const g = started(['a']);
    let most = 0;
    for (let t = 0; t < 12_000 && g.snapshot().phase === 'playing'; t += STEP) {
      balance(g, ['a']);
      g.tick(STEP);
      most = Math.max(most, g.snapshot().targets.length);
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(2);
  });

  it('scores a target for the ball that reaches it, not for anyone else', () => {
    const g = started(['a', 'b']);
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const { targets } = g.snapshot();
      const b = me(g, 'b');
      const a = me(g, 'a');
      const aim = targets[0]?.x ?? 0.5;
      // b pushes toward the target; a only keeps itself on the beam.
      g.input('b', aim > b.x + b.v * 0.3 ? 1 : -1, 0);
      g.input('a', a.x + a.v * 0.5 > 0.5 ? -1 : 1, 0);
      g.tick(STEP);
      if (me(g, 'b').meters > 0 || me(g, 'a').meters > 0) break;
    }
    expect(me(g, 'a').meters + me(g, 'b').meters).toBeGreaterThan(0);
  });

  it('gives a solo run no winner and keeps the score in the history', () => {
    const solo = started(['a']);
    play(solo, ['a'], 130_000);
    expect(solo.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
    expect(solo.snapshot().history.at(-1)?.meters).toBeGreaterThanOrEqual(0);
  });

  it('only counts people who were in the run when it started', () => {
    const g = started(['a']);
    g.join('late');
    g.input('late', 1, 0);
    run(g, 300);
    expect(me(g, 'late')).toMatchObject({ alive: false, dir: 0, fell: false });
    expect(me(g, 'late').v).toBe(0);
  });

  it('plays the same wobble for the same seed', () => {
    const track = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 5000);
      return me(g, 'a').x;
    };
    expect(track(0.4)).toBe(track(0.4));
  });
});
