import { describe, expect, it } from 'vitest';
import { DRAW_POINTS_TO_WIN } from '../spinLobby.js';
import { DrawGame } from './draw.js';

const STEP = 33;
const run = (g: DrawGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const me = (g: DrawGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new DrawGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until GO has flashed. */
function toGo(g: DrawGame) {
  for (let i = 0; i < 400 && g.snapshot().stage !== 'go'; i++) g.tick(STEP);
  expect(g.snapshot().stage).toBe('go');
}

/** Ticks until the next duel round is waiting. */
function toNextWait(g: DrawGame) {
  const duel = g.snapshot().duel;
  for (let i = 0; i < 400 && g.snapshot().duel === duel; i++) g.tick(STEP);
}

describe('DrawGame', () => {
  it('needs two players', () => {
    expect(new DrawGame().minPlayers).toBe(2);
  });

  it('waits first, and never sends how long', () => {
    const g = started(['a', 'b']);
    const snap = g.snapshot();
    expect(snap).toMatchObject({ phase: 'playing', stage: 'wait', duel: 1, sinceGoMs: 0 });
    // Only the run's own clock is sent; nothing about the secret pause before GO.
    expect(Object.keys(snap).filter((k) => /wait|pause|goAt|delay/i.test(k))).toEqual([]);
  });

  it('gives the point to the first tap after GO, and the rest are late', () => {
    const g = started(['a', 'b', 'c']);
    toGo(g);
    run(g, 200);
    g.tap('b', 0);
    g.tap('a', 0);
    const snap = g.snapshot();
    expect(snap).toMatchObject({ stage: 'result', duelWinnerId: 'b' });
    expect(snap.reactMs).toBeGreaterThanOrEqual(150);
    expect(me(g, 'b')).toMatchObject({ meters: 1, state: 'won' });
    expect(me(g, 'a')).toMatchObject({ meters: 0, state: 'late' });
  });

  it('puts a player who taps before GO out of that round only', () => {
    const g = started(['a', 'b']);
    g.tap('a', 0);
    expect(me(g, 'a').state).toBe('false');
    toGo(g);
    g.tap('a', 0);
    expect(me(g, 'a').meters).toBe(0);
    g.tap('b', 0);
    expect(me(g, 'b').meters).toBe(1);
    toNextWait(g);
    expect(me(g, 'a').state).toBe('ready');
    expect(g.snapshot().duel).toBe(2);
  });

  it('runs the round again when everyone false-starts', () => {
    const g = started(['a', 'b']);
    g.tap('a', 0);
    g.tap('b', 0);
    g.tick(STEP);
    expect(g.snapshot()).toMatchObject({ stage: 'result', duelWinnerId: null });
    toNextWait(g);
    expect(g.snapshot()).toMatchObject({ stage: 'wait', duel: 2 });
    expect(me(g, 'a').meters + me(g, 'b').meters).toBe(0);
  });

  it('ignores bad targets, and taps from someone only watching', () => {
    const g = started(['a', 'b']);
    g.join('late');
    toGo(g);
    g.tap('a', 1);
    g.tap('a', -1);
    g.tap('late', 0);
    expect(g.snapshot().stage).toBe('go');
    expect(me(g, 'late').meters).toBe(0);
  });

  it('ends the run when someone has the points, and counts the win', () => {
    const g = started(['a', 'b']);
    for (let d = 0; d < DRAW_POINTS_TO_WIN; d++) {
      toGo(g);
      g.tap('a', 0);
      if (g.snapshot().phase !== 'playing') break;
      toNextWait(g);
    }
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: 'a' });
    expect(me(g, 'a').wins).toBe(1);
    expect(g.snapshot().history.at(-1)?.meters).toBe(DRAW_POINTS_TO_WIN);
  });

  it('ends at 60 seconds with most points winning, or nobody on a tie', () => {
    const g = started(['a', 'b']);
    toGo(g);
    g.tap('a', 0);
    run(g, 62_000);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: 'a' });

    const tie = started(['a', 'b']);
    run(tie, 62_000);
    expect(tie.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('scores a run with the quickest reaction the player timed on their own device, kept within what the server saw', () => {
    const g = started(['a', 'b']);
    const scores: { userId: string; score: number }[][] = [];
    g.onRunScores = (s) => scores.push(s);
    toGo(g);
    run(g, 500); // the server sees GO half a second ago
    g.tap('a', 0, 320);
    expect(g.snapshot().reactMs).toBe(320);
    toNextWait(g);
    toGo(g);
    run(g, 300);
    g.tap('a', 0, 5000); // slower than the server saw: capped
    toNextWait(g);
    toGo(g);
    run(g, 400);
    g.tap('a', 0, 10); // faster than a person can: raised to the floor
    expect(g.snapshot().phase).toBe('over');
    expect(scores[0]).toEqual([{ userId: 'a', score: 100 }]);
  });
});
