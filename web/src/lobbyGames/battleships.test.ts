import { describe, expect, it } from 'vitest';
import { BATTLESHIPS_SIZE, LOBBY_TAP_TARGETS_MAX } from '@queueup/shared';
import { BOARD_TAPS } from './battleships';
import { tapRect, tapTargetAt, tapTargetCount } from './taps';
import { LOBBY_GAME_VIEWS } from './index';

const SIZE = BATTLESHIPS_SIZE;

describe('the Battleships board as tap targets', () => {
  it('has one target per square, and no more than a game may have', () => {
    expect(tapTargetCount(BOARD_TAPS)).toBe(SIZE * SIZE);
    expect(tapTargetCount(BOARD_TAPS)).toBeLessThanOrEqual(LOBBY_TAP_TARGETS_MAX);
  });

  it('numbers squares row by row, the same as the rules do', () => {
    const middle = (i: number) => {
      const r = tapRect(BOARD_TAPS, i)!;
      return [r.x + r.w / 2, r.y + r.h / 2] as const;
    };
    for (const i of [0, 1, SIZE - 1, SIZE, 27, SIZE * SIZE - 1]) {
      const [x, y] = middle(i);
      expect(tapTargetAt(BOARD_TAPS, x, y)).toBe(i);
    }
  });

  it('keeps the whole board on the arena, clear of the counters at the top and the scores below', () => {
    const first = tapRect(BOARD_TAPS, 0)!;
    const last = tapRect(BOARD_TAPS, SIZE * SIZE - 1)!;
    expect(first.x).toBeGreaterThan(0.05);
    expect(first.y).toBeGreaterThan(0.12);
    expect(last.x + last.w).toBeLessThan(0.95);
    expect(last.y + last.h).toBeLessThan(0.88);
  });

  it('squares do not overlap, so a tap is never ambiguous', () => {
    for (let i = 0; i < SIZE * SIZE; i++) {
      const a = tapRect(BOARD_TAPS, i)!;
      const j = i + 1;
      if (j % SIZE !== 0 && j < SIZE * SIZE) expect(tapRect(BOARD_TAPS, j)!.x).toBeGreaterThanOrEqual(a.x + a.w - 1e-9);
    }
  });

  it('is what the game is played with: no pad and no buttons', () => {
    const view = LOBBY_GAME_VIEWS.battleships;
    expect(view.taps).toBe(BOARD_TAPS);
    expect(view.pad).toBe('none');
    expect(view.actions).toEqual([]);
    expect(view.holds ?? []).toEqual([]);
  });
});
