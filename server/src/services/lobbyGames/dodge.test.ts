import { describe, expect, it } from 'vitest';
import { DODGE_BLOCK_HEIGHT, DODGE_PLAYER_WIDTH, DODGE_PLAYER_Y } from '@queueup/shared';
import { DodgeGame } from './dodge.js';

const STEP = 66;
const run = (g: DodgeGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: DodgeGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

function started(ids: string[], seed = 0.3) {
  const g = new DodgeGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** A player who reads the field: steps out of the way of blocks about to land on them, and
 * otherwise drifts toward the middle of the widest clear space. */
function playBot(g: DodgeGame, id: string, ms: number) {
  let last = '';
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    const snap = g.snapshot();
    const x = me(g, id).x;
    // Blocks that will reach the player's row within the next second and a half.
    const threats = snap.blocks.filter((b) => b.y < DODGE_PLAYER_Y + DODGE_BLOCK_HEIGHT && DODGE_PLAYER_Y - b.y < snap.speed * 1.5 + DODGE_BLOCK_HEIGHT);
    const clearance = (cx: number) => threats.reduce((m, b) => Math.min(m, Math.abs(b.x - cx) - (b.w + DODGE_PLAYER_WIDTH) / 2), 1);
    // Blocks close enough to the player's row that walking through them would be a hit.
    const inRow = snap.blocks.filter((b) => Math.abs(b.y - DODGE_PLAYER_Y) < DODGE_BLOCK_HEIGHT * 3);
    const blocked = (from: number, to: number) => inRow.some((b) => {
      const half = (b.w + DODGE_PLAYER_WIDTH) / 2;
      const left = b.x - half;
      const right = b.x + half;
      // Already overlapping the block: the only way is straight out the nearest side.
      if (from > left && from < right) return from < b.x ? to > left : to < right;
      return Math.max(from, to) > left && Math.min(from, to) < right;
    });
    // The reachable spot with the most room, preferring the nearest.
    let best = x;
    let bestScore = -Infinity;
    for (let cx = 0.05; cx <= 0.95; cx += 0.025) {
      if (blocked(x, cx)) continue;
      const score = Math.min(clearance(cx), 0.12) * 10 - Math.abs(cx - x) * 1.2;
      if (score > bestScore) {
        bestScore = score;
        best = cx;
      }
    }
    g.input(id, Math.abs(best - x) < 0.01 ? 0 : best > x ? 1 : -1, 0);
    last = JSON.stringify({ t, x, best, speed: snap.speed, near: snap.blocks.filter((b) => b.y > 0.4).map((b) => [b.x, b.y, b.w]) });
    g.tick(STEP);
  }
  return last;
}

describe('DodgeGame rounds', () => {
  it('counts down for one player, then starts a run', () => {
    const g = new DodgeGame(seeded(0.3));
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
  });

  it('makes the same blocks for the same seed', () => {
    const blocks = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 1500);
      return JSON.stringify(g.snapshot().blocks);
    };
    expect(blocks(0.4)).toBe(blocks(0.4));
    expect(blocks(0.4)).not.toBe(blocks(0.9));
  });

  it('drops blocks faster as the run goes on, to a limit', () => {
    const g = started(['a']);
    const start = g.snapshot().speed;
    playBot(g, 'a', 25_000);
    expect(g.snapshot().speed).toBeGreaterThan(start);
    expect(g.snapshot().speed).toBeLessThanOrEqual(0.9);
  });

  it('ends a solo run with no winner when a block hits', () => {
    const g = started(['a']);
    run(g, 6000); // stands still in the middle
    const snap = g.snapshot();
    expect(['over', 'countdown']).toContain(snap.phase);
    expect(me(g, 'a').wins).toBe(0);
  });
});

describe('DodgeGame moving', () => {
  it('slides left and right and stays on the screen', () => {
    const g = started(['a']);
    g.input('a', 1, 0);
    run(g, 200);
    expect(me(g, 'a').x).toBeGreaterThan(0.5);
    g.input('a', -1, 0);
    run(g, 5000);
    expect(me(g, 'a').x).toBeGreaterThanOrEqual(DODGE_PLAYER_WIDTH / 2 - 1e-9);
    g.input('a', 99, 0); // junk input is no direction
    const before = me(g, 'a').x;
    run(g, 200);
    expect(me(g, 'a').x).toBe(before);
  });

  it('ignores movement before the run starts', () => {
    const g = new DodgeGame(seeded(0.3));
    g.join('a'); // countdown
    g.input('a', 1, 0);
    run(g, 1000);
    expect(me(g, 'a').x).toBe(0.5);
  });

  it('lets a player who keeps out of the way last a long time, on several courses', () => {
    for (const seed of [0.1, 0.3, 0.55, 0.8, 0.95]) {
      const g = started(['a'], seed);
      const last = playBot(g, 'a', 60_000);
      expect(me(g, 'a').alive, `seed ${seed} ${last}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(300);
    }
  });
});

describe('DodgeGame with several players', () => {
  it('crowns the last player standing and counts a win', () => {
    const g = started(['a', 'b']);
    playBot(g, 'a', 20_000); // b never moves
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'b').alive).toBe(false);
  });

  it('lets someone who joins mid-run watch, and play from the next one', () => {
    const g = started(['a', 'b']);
    g.join('c');
    expect(me(g, 'c').alive).toBe(false);
    playBot(g, 'a', 20_000);
    run(g, 4200);
    expect(g.snapshot().phase).toBe('countdown');
    expect(me(g, 'c').alive).toBe(true);
  });
});
