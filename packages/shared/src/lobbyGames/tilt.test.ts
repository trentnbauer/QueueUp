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

/** Pushes the ball back toward the middle, as a player trying to keep it on would. */
function balance(g: TiltGame, ids: string[]) {
  const { ball } = g.snapshot();
  const want = ball.x + ball.v * 0.5 > 0.5 ? -1 : 1;
  for (const id of ids) g.input(id, want, 0);
}

function play(g: TiltGame, ids: string[], ms: number) {
  for (let t = 0; t < ms && g.snapshot().phase === 'playing'; t += STEP) {
    balance(g, ids);
    g.tick(STEP);
  }
}

describe('TiltGame', () => {
  it('starts with the ball in the middle of the beam, at rest', () => {
    const g = started(['a']);
    expect(g.snapshot().phase).toBe('playing');
    // The beam already wobbles a little, but the ball has barely moved.
    expect(Math.abs(g.snapshot().ball.x - 0.5)).toBeLessThan(0.02);
  });

  it('moves the ball the way everyone pushes, and cancels opposite pushes', () => {
    const g = started(['a', 'b']);
    g.input('a', 1, 0);
    g.input('b', 1, 0);
    run(g, 300);
    expect(g.snapshot().ball.v).toBeGreaterThan(0);

    const same = started(['a', 'b'], 0.3);
    const alone = started(['a', 'b'], 0.3);
    same.input('a', 1, 0);
    same.input('b', 1, 0);
    alone.input('a', 1, 0);
    run(same, 300);
    run(alone, 300);
    // Two pushing beat one pushing (the wobble is the same in both).
    expect(same.snapshot().ball.x).toBeGreaterThan(alone.snapshot().ball.x);
  });

  it('ends the run when the ball falls off, and shows the beam leaning the way it is pushed', () => {
    const g = started(['a']);
    g.input('a', -1, 0);
    run(g, 500);
    expect(g.snapshot().tilt).toBeLessThan(0);
    runToEnd(g, 20_000);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
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

  it('scores a target for whoever pushed last', () => {
    const g = started(['a', 'b']);
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const { ball, targets } = g.snapshot();
      const aim = targets[0]?.x ?? 0.5;
      // b pushes toward the target; a only ever pushes first, then lets go.
      const want = aim + 0.0 > ball.x + ball.v * 0.3 ? 1 : -1;
      g.input('b', want, 0);
      g.tick(STEP);
      if (me(g, 'b').meters > 0) break;
    }
    expect(me(g, 'b').meters).toBeGreaterThan(0);
    expect(me(g, 'a').meters).toBe(0);
    expect(g.snapshot().team).toBeGreaterThan(0);
  });

  it('gives the run to whoever scored the most; a tie, or a solo run, has no winner', () => {
    const solo = started(['a']);
    play(solo, ['a'], 130_000);
    expect(solo.snapshot().phase).toBe('over');
    expect(solo.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
    expect(solo.snapshot().history.at(-1)?.meters).toBeGreaterThanOrEqual(0);

    const tie = started(['a', 'b']);
    tie.input('a', 1, 0);
    runToEnd(tie, 20_000);
    expect(tie.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('only counts people who were in the run when it started', () => {
    const g = started(['a']);
    g.join('late');
    g.input('late', 1, 0);
    run(g, 300);
    expect(me(g, 'late')).toMatchObject({ alive: false, dir: 0 });
    expect(g.snapshot().ball.v).toBeLessThanOrEqual(0.0001);
  });

  it('plays the same wobble for the same seed', () => {
    const track = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 5000);
      return g.snapshot().ball.x;
    };
    expect(track(0.4)).toBe(track(0.4));
  });
});
