import { describe, expect, it } from 'vitest';
import { WALL_REACH, WALL_ROW_Y, WALL_Y, type WallSnapshot } from '../spinLobby.js';
import { BotFiller } from './bots.js';
import { WallGame, wallBrain } from './wall.js';

const STEP = 33;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const snap = (g: WallGame) => g.snapshot();
const me = (g: WallGame, id: string) => snap(g).players.find((p) => p.id === id)!;

function started(ids: string[], seed = 7) {
  const g = new WallGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays every player in turn: slides the target to the landing spot. */
function playTurns(g: WallGame, ids: string[], ms: number, skip: string[] = []) {
  for (let t = 0; t < ms && snap(g).phase === 'playing'; t += STEP) {
    const s = snap(g);
    for (const id of ids) {
      if (skip.includes(id)) continue;
      const brain = wallBrain(id, () => 0.5);
      const cmd = brain(s, STEP);
      g.input(id, cmd.dx ?? 0, 0);
    }
    g.tick(STEP);
  }
}

describe('WallGame', () => {
  it('needs two players', () => {
    expect(new WallGame().minPlayers).toBe(2);
  });

  it('spreads the players along the row and sends the ball down for the first of them', () => {
    const g = started(['a', 'b', 'c']);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.players.map((p) => p.x)).toEqual([0.25, 0.5, 0.75]);
    expect(s.leg).toBe('down');
    expect(s.targetId).toBe('a');
    expect(s.landX).toBeGreaterThan(0);
    expect(s.ball.y).toBeLessThan(0.5);
  });

  it('hits the ball back by itself for the player whose turn it is, if they are within reach as it lands', () => {
    const g = started(['a', 'b']);
    // The player does nothing but slide to the ring: no button.
    const landX = snap(g).landX;
    g.input('a', landX > me(g, 'a').x ? 1 : -1, 0);
    for (let t = 0; t < 3000 && me(g, 'a').meters === 0 && snap(g).phase === 'playing'; t += STEP) {
      const gap = snap(g).landX - me(g, 'a').x;
      g.input('a', Math.abs(gap) < 0.02 ? 0 : gap > 0 ? 1 : -1, 0);
      g.tick(STEP);
    }
    expect(me(g, 'a').meters).toBe(1);
    expect(snap(g).leg).toBe('up');
    expect(snap(g).targetId).toBe('b');
  });

  it('puts a player out whose turn it is and who is further than the reach from where it lands, however they press', () => {
    const g = started(['a', 'b']);
    const landX = snap(g).landX;
    // Slide away from the ring and stay there (the ball lands within 0.05 of a's spot at first, so a short walk is enough).
    g.input('a', landX > 0.5 ? -1 : 1, 0);
    run(g, 400);
    expect(Math.abs(me(g, 'a').x - landX)).toBeGreaterThan(WALL_REACH);
    run(g, Math.max(0, snap(g).landInMs) + 100);
    expect(me(g, 'a').alive).toBe(false);
    expect(me(g, 'a').meters).toBe(0);
  });

  it('does not hit the ball for a player whose turn it is not', () => {
    const g = started(['a', 'b']);
    // b stands wherever the ball lands for a: b is within reach but it is not their turn, so nothing happens to b.
    run(g, snap(g).landInMs - 50);
    expect(me(g, 'b').meters).toBe(0);
    expect(me(g, 'b').alive).toBe(true);
  });

  it('sends the ball back at the wall after a hit and then down for the next player', () => {
    const g = started(['a', 'b']);
    playTurns(g, ['a', 'b'], 6000);
    const s = snap(g);
    expect(s.meters).toBeGreaterThan(1);
    expect(me(g, 'a').meters).toBeGreaterThan(0);
    expect(me(g, 'b').meters).toBeGreaterThan(0);
    // The ball is always between the wall and the row.
    expect(s.ball.y).toBeGreaterThanOrEqual(WALL_Y - 0.01);
    expect(s.ball.y).toBeLessThanOrEqual(WALL_ROW_Y + 0.01);
  });

  it('turns go round the players still in, in order', () => {
    const g = started(['a', 'b', 'c']);
    const order: string[] = [];
    for (let t = 0; t < 40_000 && snap(g).phase === 'playing' && order.length < 6; t += STEP) {
      const before = snap(g).meters;
      playTurns(g, ['a', 'b', 'c'], STEP);
      if (snap(g).meters > before) order.push(snap(g).targetId!);
    }
    // After a's hit the turn is b's, then c's, then a's again.
    expect(order.slice(0, 3)).toEqual(['b', 'c', 'a']);
  });

  it('knocks out a player who misses their turn, and the last one in wins', () => {
    const g = started(['a', 'b']);
    // b never moves: it loses its first turn.
    playTurns(g, ['a', 'b'], 30_000, ['b']);
    expect(snap(g)).toMatchObject({ phase: 'over' });
    expect(me(g, 'b').alive).toBe(false);
    expect(snap(g).winnerId).toBe('a');
  });

  it('makes the ball quicker as the hits mount', () => {
    const g = started(['a', 'b']);
    const first = snap(g).landInMs;
    expect(first).toBeGreaterThan(1000);
    // Play on until it has been hit twenty times, then read how long the next trip down takes.
    for (let t = 0; t < 90_000 && snap(g).meters < 20 && snap(g).phase === 'playing'; t += STEP) playTurns(g, ['a', 'b'], STEP);
    expect(snap(g).meters).toBeGreaterThanOrEqual(20);
    for (let t = 0; t < 3000 && snap(g).leg !== 'up'; t += STEP) playTurns(g, ['a', 'b'], STEP);
    for (let t = 0; t < 3000 && snap(g).leg !== 'down'; t += STEP) playTurns(g, ['a', 'b'], STEP);
    expect(snap(g).landInMs).toBeLessThan(first - 300);
    expect(snap(g).landInMs).toBeGreaterThanOrEqual(650);
  });

  it('plays against a bot when alone', () => {
    const g = new BotFiller(new WallGame(lcg(5)), 2, (id) => wallBrain(id, lcg(9)));
    g.join('me');
    expect(g.snapshot().players.map((p) => p.id)).toEqual(['me', 'bot:1']);
    run(g, 3200);
    for (let t = 0; t < 40_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    const s = g.snapshot() as WallSnapshot;
    // I never move, so I lose my first turn (or the bot misses its own): either way the run ends.
    expect(s.phase).not.toBe('playing');
  });

  it('sends the ball\'s velocity, so a screen can keep it moving between snapshots', () => {
    const g = started(['a', 'b']);
    const before = snap(g).ball;
    expect(Math.hypot(before.vx, before.vy)).toBeGreaterThan(0.1);
    run(g, 100);
    const after = snap(g).ball;
    expect(Math.abs(after.y - (before.y + before.vy * 0.1))).toBeLessThan(0.05);
  });
});
