import { describe, expect, it } from 'vitest';
import { WORDS_LENGTH } from '@queueup/shared';
import { WORDS_TAPS, wordsLayout } from './words';
import { tapTargetCount } from './taps';

const BOARD_W = WORDS_LENGTH * 0.1 + (WORDS_LENGTH - 1) * 0.01;

describe('the Words layout', () => {
  it('centres your board on the arena when nobody else is playing', () => {
    const { boardX } = wordsLayout(0);
    expect(boardX).toBeCloseTo((1 - BOARD_W) / 2, 9);
    // Equal space either side.
    expect(boardX).toBeCloseTo(1 - (boardX + BOARD_W), 9);
  });

  it('centres the board and the others panel together when there are others', () => {
    for (const panel of [0.05, 0.2, 0.4]) {
      const { boardX, othersX } = wordsLayout(panel);
      const left = boardX;
      const right = 1 - (othersX + panel);
      expect(left).toBeCloseTo(right, 9);
      expect(othersX).toBeGreaterThan(boardX + BOARD_W);
      expect(left).toBeGreaterThan(0);
    }
  });

  it('never runs the board or the panel off the arena, whatever the panel size', () => {
    for (const panel of [0, 0.1, 0.3, 0.4]) {
      const { boardX, othersX } = wordsLayout(panel);
      expect(boardX).toBeGreaterThanOrEqual(0);
      expect(panel > 0 ? othersX + panel : boardX + BOARD_W).toBeLessThanOrEqual(1);
    }
  });

  it('has a key for every letter, Enter and Backspace', () => {
    expect(tapTargetCount(WORDS_TAPS)).toBe(28);
  });
});
