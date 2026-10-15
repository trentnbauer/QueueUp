import { describe, expect, it } from 'vitest';
import { courseOffset } from './scene';

const S = 500;
const at = (scroll: number, drift = 0) => ({ S, drift, fx: { scroll } });
/** Where the first mark of a pattern with this period is on screen, wrapped to start at 0. */
const markX = (scroll: number, period: number) => -courseOffset(at(scroll), period);

/** How far a mark moved left between two scroll positions, allowing for it wrapping round. */
function movedLeft(period: number, from: number, to: number): number {
  const d = markX(from, period) - markX(to, period);
  return ((d % period) + period) % period;
}

describe('courseOffset', () => {
  it('moves every pattern, whatever its spacing, by the distance the course moved', () => {
    // The course moves 0.03 of a screen (15px), well under either spacing, so there is no wrapping.
    for (const period of [20, 40, 80]) expect(movedLeft(period, 1.0, 1.03)).toBeCloseTo(15, 6);
  });

  it('keeps patterns of different spacing in step with each other and with obstacles', () => {
    // An obstacle at a fixed spot on the course is drawn at x = start - scrolled; a ground mark must
    // slide by the same amount, so the gap between them never changes except by the pattern repeating.
    for (const [a, b] of [[0.2, 0.31], [1.5, 1.52], [7.77, 7.9]]) {
      const obstacleMoved = (b - a) * S;
      for (const period of [20, 40, 80]) {
        const moved = markX(a, period) - markX(b, period);
        // Equal apart from whole repeats of the pattern: the distance to the nearest repeat is 0.
        const off = (((moved - obstacleMoved) % period) + period) % period;
        expect(Math.min(off, period - off)).toBeCloseTo(0, 6);
      }
    }
  });

  it('ignores the drift since the last snapshot: the scroll already moves every frame, so counting it too would run patterns at double speed and snap them back', () => {
    expect(courseOffset(at(2, 0.01), 40)).toBeCloseTo(courseOffset(at(2, 0), 40), 9);
    // Over a run of snapshots the pattern moves smoothly: each frame advances by exactly the speed.
    const speed = 0.8;
    const dt = 1 / 60;
    let scroll = 0;
    let last = markX(scroll, 40);
    for (let frame = 0; frame < 30; frame++) {
      scroll += speed * dt;
      const x = markX(scroll, 40);
      const moved = (((last - x) % 40) + 40) % 40;
      expect(moved).toBeCloseTo(speed * dt * S, 6);
      last = x;
    }
  });

  it('never exceeds the spacing', () => {
    for (const scroll of [0, 0.3, 5, 123.456]) {
      const o = courseOffset(at(scroll), 40);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(40);
    }
  });
});
