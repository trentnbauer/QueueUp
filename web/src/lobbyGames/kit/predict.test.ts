import { describe, expect, it } from 'vitest';
import { predictOwn } from './predict';

describe('predictOwn', () => {
  const walk = (dx: number) => (v: number, dt: number) => v + dx * 0.5 * dt;

  it('moves on its own the moment a direction is held, without waiting for the server', () => {
    const owner = {};
    predictOwn(owner, 'x', 0, 0.5, walk(1));
    // 100 ms later the server has said nothing new (still 0.5), but the piece is already walking.
    const later = predictOwn(owner, 'x', 100, 0.5, walk(1));
    expect(later).toBeGreaterThan(0.5);
  });

  it('is pulled back toward the server so the two never drift apart', () => {
    const owner = {};
    predictOwn(owner, 'x', 0, 0.5, walk(0));
    let value = 0.5;
    // Held right for a while, then the server says it is back at 0.5 and nothing is held.
    for (let t = 16; t <= 800; t += 16) value = predictOwn(owner, 'x', t, 0.5, walk(1));
    const pushed = value;
    for (let t = 816; t <= 3000; t += 16) value = predictOwn(owner, 'x', t, 0.5, walk(0));
    expect(pushed).toBeGreaterThan(0.5);
    expect(Math.abs(value - 0.5)).toBeLessThan(0.001);
  });

  it('keeps separate pieces apart, and caps a long gap between frames', () => {
    const owner = {};
    predictOwn(owner, 'a', 0, 0, walk(0));
    predictOwn(owner, 'b', 0, 10, walk(0));
    expect(predictOwn(owner, 'a', 5000, 0, walk(1))).toBeLessThan(0.06); // one capped 0.1 s step at 0.5 a second, then pulled back
    expect(predictOwn(owner, 'b', 5000, 10, walk(0))).toBe(10);
  });
});
