import { describe, expect, it } from 'vitest';
import { tapRect, tapTargetAt, tapTargetCount, tapTargetForKey, type TapTargets } from './taps';

const grid: TapTargets = { cols: 3, rows: 3, keys: ['7', '8', '9', '4', '5', '6', '1', '2', '3'] };
const rects: TapTargets = {
  rects: [
    { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
    { x: 0, y: 0, w: 1, h: 0.5 },
  ],
};

describe('grid tap targets', () => {
  it('numbers cells left to right, top to bottom', () => {
    expect(tapTargetCount(grid)).toBe(9);
    expect(tapTargetAt(grid, 0.1, 0.1)).toBe(0);
    expect(tapTargetAt(grid, 0.5, 0.1)).toBe(1);
    expect(tapTargetAt(grid, 0.9, 0.1)).toBe(2);
    expect(tapTargetAt(grid, 0.1, 0.5)).toBe(3);
    expect(tapTargetAt(grid, 0.5, 0.5)).toBe(4);
    expect(tapTargetAt(grid, 0.9, 0.9)).toBe(8);
  });

  it('counts the far edges as inside the last cell, and ignores taps outside the arena', () => {
    expect(tapTargetAt(grid, 1, 1)).toBe(8);
    expect(tapTargetAt(grid, 0, 0)).toBe(0);
    expect(tapTargetAt(grid, -0.01, 0.5)).toBeNull();
    expect(tapTargetAt(grid, 0.5, 1.01)).toBeNull();
    expect(tapTargetAt(grid, Number.NaN, 0.5)).toBeNull();
  });

  it('gives each cell its rectangle', () => {
    expect(tapRect(grid, 0)).toEqual({ x: 0, y: 0, w: 1 / 3, h: 1 / 3 });
    expect(tapRect(grid, 5)).toEqual({ x: 2 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 });
    expect(tapRect(grid, 9)).toBeNull();
    expect(tapRect(grid, -1)).toBeNull();
    expect(tapRect(grid, 1.5)).toBeNull();
  });

  it('maps keys to targets like a numpad', () => {
    expect(tapTargetForKey(grid, '7')).toBe(0);
    expect(tapTargetForKey(grid, '5')).toBe(4);
    expect(tapTargetForKey(grid, '3')).toBe(8);
    expect(tapTargetForKey(grid, 'x')).toBeNull();
    expect(tapTargetForKey({ cols: 2, rows: 1 }, '1')).toBeNull();
  });

  it('ignores keys past the last target', () => {
    expect(tapTargetForKey({ cols: 1, rows: 1, keys: ['a', 'b'] }, 'b')).toBeNull();
  });
});

describe('rectangle tap targets', () => {
  it('hits the first rectangle a tap is inside, so the one on top goes first', () => {
    expect(tapTargetCount(rects)).toBe(2);
    expect(tapTargetAt(rects, 0.5, 0.45)).toBe(0);
    expect(tapTargetAt(rects, 0.5, 0.2)).toBe(1);
  });

  it('misses a tap that is in no rectangle', () => {
    expect(tapTargetAt(rects, 0.5, 0.9)).toBeNull();
  });

  it('gives each rectangle back as declared', () => {
    expect(tapRect(rects, 1)).toEqual({ x: 0, y: 0, w: 1, h: 0.5 });
    expect(tapRect(rects, 2)).toBeNull();
  });
});
