import { describe, expect, it } from 'vitest';
import { BATTLESHIPS_SIZE, LOBBY_TAP_TARGETS_MAX } from '@queueup/shared';
import { BATTLE_TAPS } from './battleships';
import { tapRect, tapTargetAt, tapTargetCount, type TapRect } from './taps';
import { LOBBY_GAME_VIEWS } from './index';

const SIZE = BATTLESHIPS_SIZE;
const SQUARES = SIZE * SIZE;
const overlap = (a: TapRect, b: TapRect) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

describe('the Battleships board as tap targets', () => {
  it('has one target per square, and no more than a game may have', () => {
    expect(tapTargetCount(BATTLE_TAPS)).toBe(SQUARES);
    expect(tapTargetCount(BATTLE_TAPS)).toBeLessThanOrEqual(LOBBY_TAP_TARGETS_MAX);
  });

  it('numbers the squares row by row, the same as the rules do', () => {
    for (const i of [0, 1, SIZE - 1, SIZE, 27, SQUARES - 1]) {
      const r = tapRect(BATTLE_TAPS, i)!;
      expect(tapTargetAt(BATTLE_TAPS, r.x + r.w / 2, r.y + r.h / 2)).toBe(i);
    }
  });

  it('never has two squares on top of each other, so a tap is never ambiguous', () => {
    for (let i = 0; i < SQUARES; i++) for (let j = i + 1; j < SQUARES; j++) expect(overlap(tapRect(BATTLE_TAPS, i)!, tapRect(BATTLE_TAPS, j)!), `${i} and ${j}`).toBe(false);
  });

  it('keeps the board on the arena, clear of the counters at the top and the player list on the right', () => {
    for (let i = 0; i < SQUARES; i++) {
      const r = tapRect(BATTLE_TAPS, i)!;
      expect(r.x).toBeGreaterThan(0.02);
      expect(r.y).toBeGreaterThan(0.12);
      expect(r.x + r.w).toBeLessThan(0.78);
      expect(r.y + r.h).toBeLessThan(0.9);
    }
  });

  it('is big enough to tap: squares of at least 8% of the arena', () => {
    const r = tapRect(BATTLE_TAPS, 0)!;
    expect(r.w).toBeGreaterThanOrEqual(0.08);
    expect(r.h).toBeGreaterThanOrEqual(0.08);
  });

  it('is what the game is played with: no pad and no buttons', () => {
    const view = LOBBY_GAME_VIEWS.battleships;
    expect(view.taps).toBe(BATTLE_TAPS);
    expect(view.pad).toBe('none');
    expect(view.actions).toEqual([]);
    expect(view.holds ?? []).toEqual([]);
  });
});
