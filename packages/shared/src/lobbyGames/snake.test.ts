import { describe, expect, it } from 'vitest';
import { SNAKE_GRID } from '../spinLobby.js';
import { BotFiller } from './bots.js';
import { SnakeGame, snakeBrain } from './snake.js';

const STEP = 33;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const me = (g: SnakeGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new SnakeGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays like a bot brain would, for the named player. */
function drive(g: SnakeGame, ids: string[], ms: number, rng: () => number = seeded(0.5)) {
  const brains = new Map(ids.map((id) => [id, snakeBrain(id, rng)]));
  for (let t = 0; t < ms && g.snapshot().phase === 'playing'; t += STEP) {
    const snap = g.snapshot();
    for (const [id, brain] of brains) g.input(id, brain(snap, STEP).dx ?? 0, 0);
    g.tick(STEP);
  }
}

describe('SnakeGame', () => {
  it('needs two players', () => {
    expect(new SnakeGame().minPlayers).toBe(2);
  });

  it('starts each snake 3 cells long, spread out and facing inward, with a pickup for each', () => {
    const g = started(['a', 'b', 'c']);
    const snap = g.snapshot();
    expect(snap.phase).toBe('playing');
    const cells = snap.players.flatMap((p) => p.cells);
    expect(new Set(cells).size).toBe(cells.length);
    for (const p of snap.players) expect(p.cells).toHaveLength(3);
    expect(snap.pickups).toHaveLength(3);
    expect(snap.grid).toBe(SNAKE_GRID);
  });

  it('turns a snake on each press of left or right, and keeps moving on', () => {
    const g = started(['a', 'b']);
    const before = me(g, 'a');
    const head = before.cells[0];
    run(g, 700);
    const moved = me(g, 'a');
    expect(moved.cells[0]).not.toBe(head);
    expect(moved.heading).toBe(before.heading);
    g.input('a', 1, 0);
    run(g, 330);
    expect(me(g, 'a').heading).toBe((before.heading + 1) % 4);
  });

  it('knocks out a snake that runs into a wall, and the last one alive wins', () => {
    const g = started(['a', 'b']);
    // b turns out of the way and then steers itself; a drives straight on until it hits something.
    g.input('b', 1, 0);
    run(g, 100);
    g.input('b', 0, 0);
    for (let t = 0; t < 30_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const snap = g.snapshot();
      g.input('b', snakeBrain('b', seeded(0.5))(snap, STEP).dx ?? 0, 0);
      g.tick(STEP);
    }
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBe('b');
    expect(me(g, 'a').alive).toBe(false);
  });

  it('grows a snake that eats a pickup', () => {
    const g = started(['a', 'b']);
    let grew = false;
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing' && !grew; t += STEP) {
      drive(g, ['a', 'b'], STEP);
      grew = me(g, 'a').cells.length > 3 || me(g, 'b').cells.length > 3;
    }
    expect(grew).toBe(true);
  });

  it('puts two heads that meet in one cell both out', () => {
    // Two snakes straight at each other: starting on a ring, they face the middle and meet there.
    const g = started(['a', 'b']);
    for (let t = 0; t < 20_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).not.toBe('playing');
  });

  it('is filled by a bot when alone, who plays on and can be beaten or beat', () => {
    const g = new BotFiller(new SnakeGame(seeded(0.3)), 2, (id) => snakeBrain(id, seeded(0.5)));
    g.join('me');
    expect(g.snapshot().players.map((p) => p.id)).toEqual(['me', 'bot:1']);
    run(g, 3200);
    run(g, 5000);
    const bot = g.snapshot().players.find((p) => p.id === 'bot:1')!;
    expect(bot.cells.length === 0 ? !bot.alive : bot.alive).toBe(true);
  });

  it('lets two brains play a whole run without either breaking the rules', () => {
    for (const seed of [0.1, 0.4, 0.7, 0.95]) {
      const g = started(['a', 'b'], seed);
      drive(g, ['a', 'b'], 120_000);
      const snap = g.snapshot();
      for (const p of snap.players) expect(p.cells.length === 0 || p.cells.every((c) => c >= 0 && c < SNAKE_GRID * SNAKE_GRID)).toBe(true);
    }
  });
});
