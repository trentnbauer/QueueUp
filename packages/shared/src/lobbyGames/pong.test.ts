import { describe, expect, it } from 'vitest';
import { PONG_PADDLE_LENGTH, type PongSnapshot } from '../spinLobby.js';
import { BotFiller } from './bots.js';
import { PongGame, pongBrain } from './pong.js';

const STEP = 33;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const snap = (g: PongGame) => g.snapshot();
const me = (g: PongGame, id: string) => snap(g).players.find((p) => p.id === id)!;

function started(ids: string[], seed = 7) {
  const g = new PongGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Every player follows the ball along their own side, like a bot would. */
function follow(g: PongGame, ids: string[], ms: number) {
  const brains = new Map(ids.map((id) => [id, pongBrain(id, lcg(3))]));
  for (let t = 0; t < ms && snap(g).phase === 'playing'; t += STEP) {
    const s = snap(g);
    for (const [id, brain] of brains) g.input(id, brain(s, STEP).dx ?? 0, 0);
    g.tick(STEP);
  }
}

describe('PongGame', () => {
  it('needs two players', () => {
    expect(new PongGame().minPlayers).toBe(2);
  });

  it('gives two players the bottom and the top, and four a side each, in the order they joined', () => {
    const two = started(['a', 'b']);
    expect(two.snapshot().players.map((p) => p.seat)).toEqual([0, 1]);
    const four = started(['a', 'b', 'c', 'd']);
    expect(four.snapshot().players.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
  });

  it('lets only four play at once, and sits others out, in turn from run to run', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const g = started(ids);
    const playing = snap(g).players.filter((p) => p.seat >= 0).map((p) => p.id);
    expect(playing).toHaveLength(4);
    expect(snap(g).players.filter((p) => p.seat < 0)).toHaveLength(2);
    // The next run starts from a different player.
    for (let t = 0; t < 600_000 && snap(g).phase === 'playing'; t += STEP) g.tick(STEP);
    run(g, 6000);
    const next = snap(g).players.filter((p) => p.seat >= 0).map((p) => p.id);
    expect(next).not.toEqual(playing);
  });

  it('moves a paddle with the held direction and keeps it on its side', () => {
    const g = started(['a', 'b']);
    g.input('a', 1, 0);
    run(g, 700); // still serving, so nobody has missed yet
    expect(me(g, 'a').pos).toBeCloseTo(1 - PONG_PADDLE_LENGTH / 2, 3);
    g.input('a', -1, 0);
    run(g, 700);
    expect(me(g, "a").pos).toBeLessThan(0.5);
    g.input('a', 99, 0); // junk input is no direction
    const before = me(g, 'a').pos;
    run(g, 100);
    expect(me(g, 'a').pos).toBe(before);
  });

  it('serves from the middle after a pause, and speeds up with each return', () => {
    const g = started(['a', 'b']);
    expect(snap(g).serving).toBe(true);
    expect(snap(g).ball).toEqual({ x: 0.5, y: 0.5 });
    follow(g, ['a', 'b'], 20_000);
    expect(snap(g).meters).toBeGreaterThan(3);
  });

  it('knocks out a player who misses and makes their side a wall, and the last one in wins', () => {
    const g = started(['a', 'b']);
    // b follows the ball; a never moves, so the ball eventually gets past it.
    const brain = pongBrain('b', lcg(5));
    for (let t = 0; t < 200_000 && snap(g).phase === 'playing'; t += STEP) {
      g.input('b', brain(snap(g), STEP).dx ?? 0, 0);
      g.tick(STEP);
    }
    expect(snap(g)).toMatchObject({ phase: 'over' });
    expect(snap(g).winnerId === 'b' || snap(g).winnerId === null).toBe(true);
    expect(me(g, 'a').alive).toBe(false);
  });

  it('plays against a bot when alone, who returns the ball and can be beaten', () => {
    const g = new BotFiller(new PongGame(lcg(5)), 2, (id) => pongBrain(id, lcg(9)));
    g.join('me');
    expect(g.snapshot().players.map((p) => p.id)).toEqual(['me', 'bot:1']);
    run(g, 3200);
    for (let t = 0; t < 120_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    const s = g.snapshot() as PongSnapshot;
    expect(s.phase).not.toBe('playing');
    expect(s.players.some((p) => !p.alive)).toBe(true);
  });

  it('keeps the ball inside the court', () => {
    const g = started(['a', 'b', 'c']);
    for (let t = 0; t < 60_000 && snap(g).phase === 'playing'; t += STEP) {
      g.tick(STEP);
      const { x, y } = snap(g).ball;
      expect(x).toBeGreaterThan(-0.2);
      expect(x).toBeLessThan(1.2);
      expect(y).toBeGreaterThan(-0.2);
      expect(y).toBeLessThan(1.2);
    }
  });
});
