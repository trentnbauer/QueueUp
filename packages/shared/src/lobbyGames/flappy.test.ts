import { describe, expect, it } from 'vitest';
import { FLAPPY_X, FLAPPY_PIPE_WIDTH } from '../spinLobby.js';
import { FlappyGame } from './flappy.js';

const STEP = 66;
const run = (g: FlappyGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: FlappyGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

function started(ids: string[], seed = 0.3) {
  const g = new FlappyGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** A player who reads the course: flaps to hold the bird level with the middle of the next gap. */
function playBot(g: FlappyGame, id: string, ms: number) {
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    const snap = g.snapshot();
    const next = snap.pipes.filter((p) => p.x > FLAPPY_X - FLAPPY_PIPE_WIDTH).sort((a, b) => a.x - b.x)[0];
    const target = next ? next.gap : 0.5;
    if (me(g, id).y < target - 0.03) g.action(id, 'flap');
    g.tick(STEP);
  }
}

describe('FlappyGame rounds', () => {
  it('counts down for a lone bird, then starts a run', () => {
    const g = new FlappyGame(seeded(0.3));
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(me(g, 'a').alive).toBe(true);
  });

  it('knocks a bird out when it hits the floor, and ends a solo run with no winner', () => {
    const g = started(['a']);
    run(g, 3000); // never flaps
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBeNull();
    expect(me(g, 'a').alive).toBe(false);
    expect(me(g, 'a').wins).toBe(0);
  });

  it('makes the course the same for the same seed', () => {
    const course = (seed: number) => {
      const g = started(['a'], seed);
      return JSON.stringify(g.snapshot().pipes);
    };
    expect(course(0.4)).toBe(course(0.4));
    expect(course(0.4)).not.toBe(course(0.9));
  });

  it('keeps speeding up for as long as a run goes on, past where it used to stop', () => {
    const g = started(['a']);
    const start = g.snapshot().speed;
    playBot(g, 'a', 30_000);
    expect(g.snapshot().speed).toBeGreaterThan(start);
    expect(g.snapshot().speed).toBeGreaterThan(0.8);
  });
});

describe('FlappyGame flying', () => {
  it('flaps upward and falls back down, only during a run', () => {
    const waiting = new FlappyGame(seeded(0.3));
    waiting.join('a');
    waiting.action('a', 'flap'); // countdown: ignored
    expect(me(waiting, 'a').y).toBe(0.5);

    const g = started(['a']);
    const before = me(g, 'a').y;
    g.action('a', 'flap');
    g.tick(STEP);
    expect(me(g, 'a').y).toBeGreaterThan(before);
    g.action('a', 'swim'); // unknown action
  });

  it('lets a bird that follows the gaps fly a long way, on several courses', () => {
    for (const seed of [0.1, 0.3, 0.55, 0.8, 0.95]) {
      const g = started(['a'], seed);
      playBot(g, 'a', 60_000);
      expect(me(g, 'a').alive, `seed ${seed}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(200);
    }
  });

  it('knocks a bird out that flaps into the ceiling', () => {
    const g = started(['a']);
    for (let i = 0; i < 40 && me(g, 'a').alive; i++) {
      g.action('a', 'flap');
      g.tick(STEP);
    }
    expect(me(g, 'a').alive).toBe(false);
  });
});

describe('FlappyGame with several birds', () => {
  it('crowns the last bird flying and counts a win', () => {
    const g = started(['a', 'b']);
    playBot(g, 'a', 8000); // b never flaps and hits the floor
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'b').alive).toBe(false);
  });

  it('lets someone who joins mid-run watch, and fly from the next one', () => {
    const g = started(['a', 'b']);
    g.join('c');
    expect(me(g, 'c').alive).toBe(false);
    playBot(g, 'a', 8000);
    run(g, 4200);
    expect(g.snapshot().phase).toBe('countdown');
    expect(me(g, 'c').alive).toBe(true);
  });

  it('ends the run if the other bird leaves', () => {
    const g = started(['a', 'b']);
    g.leave('b');
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBe('a');
  });
});

describe('FlappyGame summary data', () => {
  it("numbers pipes, reports each bird's vertical speed, and counts runs", () => {
    const g = started(['a']);
    expect(g.snapshot().pipes[0].n).toBe(1);
    expect(g.snapshot().run).toBe(1);
    g.action('a', 'flap');
    g.tick(STEP);
    expect(me(g, 'a').vy).toBeGreaterThan(0);
    run(g, 800);
    expect(me(g, 'a').vy).toBeLessThan(0);
  });
});
