import { describe, expect, it } from 'vitest';
import { BATTLESHIPS_SIZE, BATTLESHIPS_TARGET_BASE, LOBBY_TAP_TARGETS_MAX } from '@queueup/shared';
import { BATTLE_TAPS, chipTarget } from './battleships';
import { tapRect, tapTargetAt, tapTargetCount, type TapRect } from './taps';
import { LOBBY_GAME_VIEWS } from './index';

const SIZE = BATTLESHIPS_SIZE;
const SQUARES = SIZE * SIZE;
const centre = (i: number) => {
  const r = tapRect(BATTLE_TAPS, i)!;
  return [r.x + r.w / 2, r.y + r.h / 2] as const;
};
const overlap = (a: TapRect, b: TapRect) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

describe('the Battleships boards as tap targets', () => {
  it('has the 64 squares and then a chip for each other player, within what a game may have', () => {
    expect(tapTargetCount(BATTLE_TAPS)).toBe(SQUARES + 11);
    expect(tapTargetCount(BATTLE_TAPS)).toBeLessThanOrEqual(LOBBY_TAP_TARGETS_MAX);
    expect(BATTLESHIPS_TARGET_BASE).toBe(SQUARES);
    expect(chipTarget(0)).toBe(BATTLESHIPS_TARGET_BASE);
    expect(chipTarget(10)).toBe(BATTLESHIPS_TARGET_BASE + 10);
  });

  it('numbers the squares row by row, the same as the rules do, and the chips after them', () => {
    for (const i of [0, 1, SIZE - 1, SIZE, 27, SQUARES - 1, SQUARES, SQUARES + 1, SQUARES + 10]) {
      const [x, y] = centre(i);
      expect(tapTargetAt(BATTLE_TAPS, x, y)).toBe(i);
    }
  });

  it('never has two targets on top of each other, so a tap is never ambiguous', () => {
    const n = tapTargetCount(BATTLE_TAPS);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlap(tapRect(BATTLE_TAPS, i)!, tapRect(BATTLE_TAPS, j)!), `${i} and ${j}`).toBe(false);
  });

  it('keeps everything on the arena, clear of the counters at the top', () => {
    for (let i = 0; i < tapTargetCount(BATTLE_TAPS); i++) {
      const r = tapRect(BATTLE_TAPS, i)!;
      expect(r.x).toBeGreaterThan(0.02);
      expect(r.y).toBeGreaterThan(0.12);
      expect(r.x + r.w).toBeLessThan(0.98);
      expect(r.y + r.h).toBeLessThan(0.98);
    }
  });

  it('is what the game is played with: no pad and no buttons', () => {
    const view = LOBBY_GAME_VIEWS.battleships;
    expect(view.taps).toBe(BATTLE_TAPS);
    expect(view.pad).toBe('none');
    expect(view.actions).toEqual([]);
    expect(view.holds ?? []).toEqual([]);
  });
});
