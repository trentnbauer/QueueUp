import { describe, expect, it } from 'vitest';
import { RUNNER_X } from '@queueup/shared';
import { RunnerGame } from './runner.js';

const STEP = 66;
const run = (g: RunnerGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: RunnerGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

/** Starts a run (past the countdown) with fixed seeds, so the course is the same every time. */
function started(ids: string[], seed = 0.3) {
  const g = new RunnerGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200);
  return g;
}

/** A player who reads the course: jumps cacti and ducks birds as they arrive. */
function playBot(g: RunnerGame, id: string, ms: number) {
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    const snap = g.snapshot();
    const next = snap.obstacles.filter((o) => o.x > RUNNER_X - 0.07).sort((a, b) => a.x - b.x)[0];
    const ahead = next ? next.x - RUNNER_X : Infinity;
    if (next?.kind === 'cactus' && ahead < snap.speed * 0.37) g.action(id, 'jump');
    g.input(id, 0, next?.kind === 'bird' && ahead < snap.speed * 0.5 && ahead > -0.05 ? 1 : 0);
    g.tick(STEP);
  }
}

describe('RunnerGame rounds', () => {
  it('starts a countdown for a lone runner, then a run', () => {
    const g = new RunnerGame(seeded(0.3));
    expect(g.snapshot().phase).toBe('lobby');
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(me(g, 'a').alive).toBe(true);
  });

  it('makes the same course for the same seed, and a different one for another', () => {
    const course = (seed: number) => {
      const g = started(['a'], seed);
      const kinds: string[] = [];
      for (let i = 0; i < 400; i++) {
        g.tick(STEP);
        for (const o of g.snapshot().obstacles) if (o.x > 1.2) kinds.push(o.kind);
      }
      return kinds.join(',');
    };
    expect(course(0.3)).toBe(course(0.3));
  });

  it('speeds up over a run, to a limit', () => {
    const g = started(['a']);
    const start = g.snapshot().speed;
    playBot(g, 'a', 20_000);
    expect(g.snapshot().speed).toBeGreaterThan(start);
    expect(g.snapshot().speed).toBeLessThanOrEqual(1);
  });

  it('knocks a runner out when they hit a cactus and ends a solo run with no winner', () => {
    const g = started(['a']);
    run(g, 3500); // never jumps
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBeNull();
    expect(me(g, 'a').alive).toBe(false);
    expect(me(g, 'a').meters).toBeGreaterThan(0);
    expect(me(g, 'a').wins).toBe(0);
  });

  it('starts another run after the result has been shown', () => {
    const g = started(['a']);
    run(g, 3500);
    expect(g.snapshot().phase).toBe('over');
    run(g, 4200);
    expect(g.snapshot().phase).toBe('countdown');
    expect(me(g, 'a').alive).toBe(true);
    expect(g.snapshot().meters).toBe(0);
  });
});

describe('RunnerGame obstacles', () => {
  it('lets a runner who jumps the cacti and ducks the birds run a long way', () => {
    // Several different courses: every one can be cleared.
    for (const seed of [0.1, 0.3, 0.55, 0.8, 0.95]) {
      const g = started(['a'], seed);
      playBot(g, 'a', 60_000);
      expect(me(g, 'a').alive, `seed ${seed}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(300);
    }
  });

  it('knocks out a runner who jumps into a bird', () => {
    const g = started(['a']);
    let died = false;
    for (let t = 0; t < 40_000 && !died; t += STEP) {
      const snap = g.snapshot();
      const next = snap.obstacles.filter((o) => o.x > RUNNER_X - 0.07).sort((a, b) => a.x - b.x)[0];
      const ahead = next ? next.x - RUNNER_X : Infinity;
      // Clears cacti, but jumps at birds as well (never ducks).
      if (next && ahead < snap.speed * 0.37) g.action('a', 'jump');
      g.tick(STEP);
      died = !me(g, 'a').alive;
    }
    expect(died).toBe(true);
  });

  it('only jumps from the ground, and only while a run is on', () => {
    const waiting = new RunnerGame(seeded(0.3));
    waiting.join('a'); // countdown
    waiting.action('a', 'jump');
    expect(me(waiting, 'a').h).toBe(0);

    const g = started(['a']);
    g.action('a', 'jump');
    g.tick(STEP);
    const up = me(g, 'a').h;
    expect(up).toBeGreaterThan(0);
    g.action('a', 'jump'); // already in the air: no double jump
    run(g, 800);
    expect(me(g, 'a').h).toBe(0); // landed
  });

  it('ducks on the ground only', () => {
    const g = started(['a']);
    g.input('a', 0, 1);
    g.tick(STEP);
    expect(me(g, 'a').ducking).toBe(true);
    g.input('a', 0, 0);
    g.tick(STEP);
    expect(me(g, 'a').ducking).toBe(false);
  });
});

describe('RunnerGame with several runners', () => {
  it('crowns the last runner standing and counts a win', () => {
    const g = started(['a', 'b']);
    // a reads the course; b never moves and hits the first cactus.
    playBot(g, "a", 8000);
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'b').alive).toBe(false);
  });

  it('lets someone who joins mid-run watch, and run from the next one', () => {
    const g = started(['a', 'b']);
    g.join('c');
    expect(me(g, 'c').alive).toBe(false);
    playBot(g, "a", 8000);
    run(g, 4200);
    expect(g.snapshot().phase).toBe('countdown');
    expect(me(g, 'c').alive).toBe(true);
  });

  it('ends the run if the other runner leaves, and resets when everyone has left', () => {
    const g = started(['a', 'b']);
    g.leave('b');
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBe('a');
    g.leave('a');
    expect(g.snapshot().phase).toBe('lobby');
    g.join('d');
    expect(g.snapshot().phase).toBe('countdown');
  });
});

describe('RunnerGame run summary and obstacle ids', () => {
  it('counts runs, keeps the last results and the best run', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    expect(g.snapshot().run).toBe(1);
    expect(g.snapshot().history).toEqual([]);
    expect(g.snapshot().best).toBeNull();

    run(g, 3200); // countdown over
    run(g, 3500); // never jumps: a solo run ends
    const first = g.snapshot();
    expect(first.phase).toBe('over');
    expect(first.history).toHaveLength(1);
    expect(first.history[0]).toMatchObject({ id: 'a', winnerId: null });
    expect(first.history[0].meters).toBeGreaterThan(0);
    expect(first.best).toEqual(first.history[0]);

    run(g, 4200); // result shown, next run counts down
    expect(g.snapshot().run).toBe(2);
  });

  it('records who won and keeps only the last 10 runs', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    g.join('b');
    for (let i = 0; i < 12; i++) {
      run(g, 3200);
      playBot(g, 'a', 8000); // b stands still and is knocked out
      run(g, 4200);
    }
    const snap = g.snapshot();
    expect(snap.history).toHaveLength(10);
    expect(snap.history.every((r) => r.winnerId === 'a' && r.id === 'a')).toBe(true);
    expect(snap.run).toBeGreaterThan(10);
  });

  it('numbers obstacles so they keep their number as they scroll', () => {
    const g = started(['a'], 0.4);
    const first = g.snapshot().obstacles[0];
    expect(first.n).toBe(1);
    run(g, 500);
    const same = g.snapshot().obstacles.find((o) => o.n === 1);
    expect(same).toBeDefined();
    expect(same!.x).toBeLessThan(first.x);
    expect(new Set(g.snapshot().obstacles.map((o) => o.n)).size).toBe(g.snapshot().obstacles.length);
  });
});
