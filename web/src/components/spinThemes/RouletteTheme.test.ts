import { describe, it, expect } from 'vitest';
import { candidateIndexAt } from '@queueup/shared';
import { wheelRotation } from './RouletteTheme';

describe('wheelRotation (issue #356 follow-up)', () => {
  it('brings segment 0\'s center to the pointer at position 0', () => {
    const stripLength = 8;
    // Segment 0 spans [0, 45)deg, centered at 22.5deg clockwise from top - rotating the wheel by
    // -22.5deg brings that center to the pointer (0deg/top).
    expect(wheelRotation(0, stripLength)).toBeCloseTo(-22.5);
  });

  it('advances by exactly one segment-width per whole slot of position', () => {
    const stripLength = 8;
    const segmentAngle = 360 / stripLength;
    const r0 = wheelRotation(0, stripLength);
    const r1 = wheelRotation(1, stripLength);
    expect(r0 - r1).toBeCloseTo(segmentAngle);
  });

  it('interpolates smoothly for a fractional position, not just at integers', () => {
    const stripLength = 8;
    const r0 = wheelRotation(0, stripLength);
    const rHalf = wheelRotation(0.5, stripLength);
    const r1 = wheelRotation(1, stripLength);
    expect(rHalf).toBeCloseTo((r0 + r1) / 2);
  });

  it('agrees with candidateIndexAt on which slot ends up at the pointer once settled', () => {
    // At a whole-number position, the wheel should have rotated by exactly enough whole segments
    // that candidateIndexAt(position, length) is the slot under the pointer, same contract the
    // slot machine/card flip themes rely on.
    const stripLength = 12;
    for (const position of [0, 1, 5, 11, 12, 37]) {
      const segmentAngle = 360 / stripLength;
      const rotation = wheelRotation(position, stripLength);
      // Normalizing the rotation's fractional-segment remainder back out should reproduce the same
      // slot candidateIndexAt resolves to, confirming the two never disagree on "what's at the top".
      const impliedSlot = candidateIndexAt(-rotation / segmentAngle - 0.5, stripLength);
      expect(impliedSlot).toBe(candidateIndexAt(position, stripLength));
    }
  });
});
