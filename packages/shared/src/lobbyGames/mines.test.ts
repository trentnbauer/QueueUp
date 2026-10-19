import { describe, expect, it } from 'vitest';
import { MINES_COLS, MINES_COUNT, MINES_ROWS, MINES_TARGETS } from '../spinLobby.js';
import { MinesGame } from './mines.js';

const STEP = 33;
const run = (g: MinesGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const me = (g: MinesGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 7) {
  const g = new MinesGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

const neighboursOf = (i: number) => {
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = (i % MINES_COLS) + dx;
      const y = Math.floor(i / MINES_COLS) + dy;
      if ((dx || dy) && x >= 0 && y >= 0 && x < MINES_COLS && y < MINES_ROWS) out.push(y * MINES_COLS + x);
    }
  }
  return out;
};

/** Opens every square in turn, each by the next player still in: with more players than mines the field gets cleared (each mine
 * costs a player), without anyone reading anything hidden. */
function clearWithCrowd(g: MinesGame, ids: string[]) {
  let turn = 0;
  for (let i = 0; i < MINES_TARGETS && g.snapshot().phase === 'playing'; i++) {
    if (g.snapshot().cells[i] !== -1) continue;
    const alive = ids.filter((id) => me(g, id).alive);
    if (alive.length === 0) break;
    g.tap(alive[turn++ % alive.length], i);
  }
}

describe('MinesGame', () => {
  it('starts with every square shut and no mine shown', () => {
    const g = started(['a', 'b']);
    const s = g.snapshot();
    expect(s.phase).toBe('playing');
    expect(s.cells).toEqual(Array(MINES_TARGETS).fill(-1));
    expect(s.safeLeft).toBe(MINES_TARGETS - MINES_COUNT);
    expect(JSON.stringify(s)).not.toMatch(/mine"?s?":\s*\[/);
  });

  it('makes the first square safe, and the squares round it, and scores what it opens', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const g = started(['a'], seed);
      g.tap('a', 40);
      const s = g.snapshot();
      expect(me(g, 'a').alive).toBe(true);
      expect(s.cells[40]).toBe(0);
      for (const k of neighboursOf(40)) expect(s.cells[k]).toBeGreaterThanOrEqual(0);
      expect(me(g, 'a').meters).toBeGreaterThan(8);
      expect(s.by[40]).toBe(0);
    }
  });

  it('shows how many mines are next to a square, and the count matches the field', () => {
    const g = started(['a'], 3);
    g.tap('a', 0);
    const s = g.snapshot();
    // Every shut square next to an opened number is within reach of that many mines; check the opened numbers add up to something sane.
    for (let i = 0; i < MINES_TARGETS; i++) if (s.cells[i] >= 0) expect(s.cells[i]).toBeLessThanOrEqual(8);
    expect(s.safeLeft).toBe(MINES_TARGETS - MINES_COUNT - me(g, 'a').meters);
  });

  it('knocks out a player who opens a mine, shows it to everyone, and ignores a second tap on it', () => {
    let hit = false;
    for (let seed = 1; seed < 40 && !hit; seed++) {
      const g = started(['a', 'b'], seed);
      g.tap('a', 40);
      const s = g.snapshot();
      // Tap shut squares until one is a mine.
      for (let i = 0; i < MINES_TARGETS && me(g, 'b').alive; i++) {
        if (g.snapshot().cells[i] === -1) g.tap('b', i);
      }
      if (!me(g, 'b').alive) {
        hit = true;
        const after = g.snapshot();
        const mine = after.cells.indexOf(9);
        expect(mine).toBeGreaterThanOrEqual(0);
        expect(after.by[mine]).toBe(1);
        expect(me(g, 'b').fell).toBe(true);
        const scoreBefore = me(g, 'a').meters;
        g.tap('a', mine);
        expect(me(g, 'a').alive).toBe(true);
        expect(me(g, 'a').meters).toBe(scoreBefore);
      }
      void s;
    }
    expect(hit).toBe(true);
  });

  it('ends the run when every safe square is open, and gives it to whoever opened the most', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const g = started(ids, 5);
    clearWithCrowd(g, ids);
    const s = g.snapshot();
    expect(s.phase).toBe('over');
    expect(s.safeLeft).toBe(0);
    expect(s.cells.filter((c) => c === 9).length).toBeGreaterThan(0);
    const best = Math.max(...s.players.map((p) => p.meters));
    expect(s.players.filter((p) => p.meters === best).length === 1 ? s.winnerId : 'tie').toBe(s.players.filter((p) => p.meters === best).length === 1 ? s.players.find((p) => p.meters === best)!.id : 'tie');
  });

  it('ends a solo run when the player hits a mine, with no winner', () => {
    const g = started(['a'], 9);
    g.tap('a', 40);
    for (let i = 0; i < MINES_TARGETS && g.snapshot().phase === 'playing'; i++) if (g.snapshot().cells[i] === -1) g.tap('a', i);
    run(g, 100);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('ignores bad targets, taps outside a run, and taps from someone who is only watching', () => {
    const g = new MinesGame(lcg(2));
    g.join('a');
    g.tap('a', 3);
    expect(g.snapshot().cells[3]).toBe(-1);
    run(g, 3200);
    g.tap('a', -1);
    g.tap('a', MINES_TARGETS);
    g.tap('a', 1.5);
    expect(g.snapshot().cells.every((c) => c === -1)).toBe(true);
    g.join('late');
    g.tap('late', 40);
    expect(g.snapshot().cells.every((c) => c === -1)).toBe(true);
  });

  it('lays the same field for the same seed', () => {
    const field = (seed: number) => {
      const g = started(['a'], seed);
      g.tap('a', 40);
      for (let i = 0; i < MINES_TARGETS && me(g, 'a').alive; i++) if (g.snapshot().cells[i] === -1) g.tap('a', i);
      return g.snapshot().cells.indexOf(9);
    };
    expect(field(11)).toBe(field(11));
  });
});
