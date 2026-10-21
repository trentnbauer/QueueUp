import { describe, expect, it } from 'vitest';
import { ODDONEOUT_HIT, ODDONEOUT_TARGETS } from '../spinLobby.js';
import { OddOneOutGame, boardSize, oddDelta } from './oddoneout.js';

const STEP = 50;
const run = (g: OddOneOutGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: OddOneOutGame) => g.snapshot();
const me = (g: OddOneOutGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new OddOneOutGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** The target to tap for tile `tile` of the board that is on (the top left of the part of the 6 by 6 grid the tile covers). */
function targetFor(g: OddOneOutGame, tile: number): number {
  const n = snap(g).board.n;
  const per = ODDONEOUT_HIT / n;
  return Math.floor(tile / n) * per * ODDONEOUT_HIT + (tile % n) * per;
}
const rightTarget = (g: OddOneOutGame) => targetFor(g, snap(g).board.odd);
/** A tile that is not the odd one. */
const wrongTarget = (g: OddOneOutGame) => targetFor(g, (snap(g).board.odd + 1) % (snap(g).board.n ** 2));

describe('boardSize and oddDelta', () => {
  it('goes 2, then 3, then 6 tiles across', () => {
    expect([0, 2, 3, 7, 8, 40].map(boardSize)).toEqual([2, 2, 3, 3, 6, 6]);
  });

  it('shrinks the difference on every board, without ever reaching nothing', () => {
    expect(oddDelta(0)).toBeCloseTo(0.22, 5);
    let last = oddDelta(0);
    for (const r of [1, 5, 10, 30, 100, 1000]) {
      expect(oddDelta(r)).toBeLessThan(last);
      last = oddDelta(r);
    }
    expect(oddDelta(1000)).toBeGreaterThan(0);
  });
});

describe('OddOneOutGame', () => {
  it('starts a run with a 2 by 2 board, full of nothing but one odd tile, and everyone on 10 health', () => {
    const g = started(['a', 'b']);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.board.n).toBe(2);
    expect(s.board.odd).toBeGreaterThanOrEqual(0);
    expect(s.board.odd).toBeLessThan(4);
    expect(Math.abs(s.board.delta)).toBeCloseTo(0.22, 2);
    for (const p of s.players) {
      expect(p.hp).toBeGreaterThan(9);
      expect(p.hp).toBeLessThanOrEqual(10);
      expect(p.meters).toBe(0);
    }
  });

  it('maps a tap on the 6 by 6 grid to the tile it was aimed at, on every size of board', () => {
    // Walk through boards of 2, 3 and 6 tiles across, tapping the exact odd tile each time, from every cell it covers.
    const g = started(['a']);
    g.hpDrainScale = 0;
    const sizes = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const b = snap(g).board;
      sizes.add(b.n);
      const per = ODDONEOUT_HIT / b.n;
      // A wrong tap from the cell at the far corner of a neighbouring tile does not count...
      const row = Math.floor(b.odd / b.n) * per;
      const col = (b.odd % b.n) * per;
      for (let dr = 0; dr < per; dr++) for (let dc = 0; dc < per; dc++) expect(row + dr).toBeLessThan(ODDONEOUT_HIT), expect(col + dc).toBeLessThan(ODDONEOUT_HIT);
      // ...and a tap on any cell the odd tile covers scores. Tap the last one it covers.
      const before = me(g, 'a').meters;
      g.tap('a', (row + per - 1) * ODDONEOUT_HIT + col + per - 1);
      expect(me(g, 'a').meters, `board ${i}`).toBe(before + 1);
    }
    expect([...sizes].sort()).toEqual([2, 3, 6]);
  });

  it('scores a point and a new board for the first right tap, and refills health up to 20', () => {
    const g = started(['a', 'b']);
    g.hpDrainScale = 0;
    const first = JSON.stringify(snap(g).board);
    g.tap('a', rightTarget(g));
    expect(me(g, 'a').meters).toBe(1);
    expect(me(g, 'b').meters).toBe(0);
    expect(snap(g).round).toBe(1);
    expect(JSON.stringify(snap(g).board)).not.toBe(first);
    expect(me(g, 'a').hp).toBeCloseTo(13, 0);
    for (let i = 0; i < 6; i++) g.tap('a', rightTarget(g));
    expect(me(g, 'a').hp).toBe(20);
  });

  it('costs health and locks the player out for a moment on a wrong tap, until the next board', () => {
    const g = started(['a', 'b']);
    g.hpDrainScale = 0;
    g.tap('a', wrongTarget(g));
    expect(me(g, 'a').hp).toBeCloseTo(7, 0);
    expect(me(g, 'a').lockMs).toBeGreaterThan(0);
    // Locked out: even the right tile does nothing.
    g.tap('a', rightTarget(g));
    expect(me(g, 'a').meters).toBe(0);
    run(g, 700);
    expect(me(g, 'a').lockMs).toBe(0);
    g.tap('a', rightTarget(g));
    expect(me(g, 'a').meters).toBe(1);
    // Someone else getting a board right lifts the lock for the next one.
    g.tap('b', wrongTarget(g));
    g.tap('a', rightTarget(g));
    expect(me(g, 'b').lockMs).toBe(0);
  });

  it('ignores taps that are not on the grid, from someone not in, or before the run', () => {
    const g = new OddOneOutGame(lcg(3));
    g.join('a');
    g.tap('a', 0); // countdown
    expect(me(g, 'a').meters).toBe(0);
    run(g, 3200);
    for (const target of [-1, 1.5, ODDONEOUT_TARGETS, 1e9, Number.NaN]) g.tap('a', target);
    g.tap('nobody', 0);
    expect(me(g, 'a').hp).toBeGreaterThan(9);
  });

  it('makes the same boards for the same seed, and others for another', () => {
    const boards = (seed: number) => {
      const g = started(['a'], seed);
      g.hpDrainScale = 0;
      const out: unknown[] = [];
      for (let i = 0; i < 10; i++) {
        out.push(snap(g).board);
        g.tap('a', rightTarget(g));
      }
      return JSON.stringify(out);
    };
    expect(boards(5)).toBe(boards(5));
    expect(boards(5)).not.toBe(boards(9));
  });

  it('drains health all the time, faster as the run goes on, and puts out someone who never taps; a solo run ends with no winner and keeps the score', () => {
    const g = started(['a']);
    const start = me(g, 'a').hp;
    run(g, 3000);
    const early = start - me(g, 'a').hp;
    expect(early).toBeGreaterThan(1.4);
    expect(early).toBeLessThan(2.5);
    let t = 0;
    for (; t < 90_000 && snap(g).phase === 'playing'; t += STEP) g.tick(STEP);
    expect(snap(g).phase).toBe('over');
    expect(t / 1000).toBeLessThan(25);
    expect(me(g, 'a').alive).toBe(false);
    expect(snap(g).winnerId).toBeNull();
  });

  it('keeps going for someone who taps right at a steady pace, and in the end it is too hard for everyone', () => {
    // A player who always finds the tile, one every 1.5 seconds, however faint: only the draining bar ends the run.
    const g = started(['a']);
    let t = 0;
    for (; t < 900_000 && snap(g).phase === 'playing'; t += STEP) {
      if (t % 1500 < STEP) g.tap('a', rightTarget(g));
      g.tick(STEP);
    }
    expect(snap(g).phase).toBe('over');
    expect(t / 1000).toBeGreaterThan(30);
    expect(t / 1000).toBeLessThan(900);
    expect(snap(g).history.at(-1)!.meters).toBeGreaterThan(10);
  });

  it('crowns the last one in, with their own right taps as the run', () => {
    const g = started(['a', 'b']);
    // 'a' keeps finding the tile; 'b' never taps, so their health runs out.
    let t = 0;
    for (; t < 120_000 && snap(g).phase === 'playing'; t += STEP) {
      if (t % 800 < STEP) g.tap('a', rightTarget(g));
      g.tick(STEP);
    }
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(s.history.at(-1)).toMatchObject({ winnerId: 'a', meters: me(g, 'a').meters });
    expect(me(g, 'a').meters).toBeGreaterThan(5);
  });

  it('ends at the lobby time cap, with whoever is still in keeping their taps and nobody winning', () => {
    const g = started(['a', 'b']);
    g.timeLimitS = 20;
    for (let t = 0; t < 30_000 && snap(g).phase === 'playing'; t += STEP) {
      if (t % 800 < STEP) {
        g.tap('a', rightTarget(g));
        g.tap('b', rightTarget(g));
      }
      g.tick(STEP);
    }
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBeNull();
  });

  it('lets someone who arrives mid-run watch, and play from the next one', () => {
    const g = started(['a']);
    g.hpDrainScale = 0;
    g.join('late');
    expect(me(g, 'late').alive).toBe(false);
    g.tap('late', rightTarget(g));
    expect(me(g, 'late').meters).toBe(0);
    expect(me(g, 'a').hp).toBeGreaterThan(9);
  });

  it('starts the next run by itself, with scores back to zero', () => {
    const g = started(['a']);
    for (let t = 0; t < 90_000 && snap(g).phase === 'playing'; t += STEP) g.tick(STEP);
    run(g, 4000 + 3200);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.run).toBe(2);
    expect(me(g, 'a')).toMatchObject({ alive: true, meters: 0 });
    expect(s.round).toBe(0);
    expect(s.board.n).toBe(2);
  });
});
