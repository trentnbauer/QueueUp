import { describe, expect, it } from 'vitest';
import { ownershipPlatformsOverlap } from './publicProfile.js';

describe('ownershipPlatformsOverlap', () => {
  it('matches when the two claims share a platform', () => {
    expect(ownershipPlatformsOverlap(['pc', 'ps5'], ['ps5'])).toBe(true);
  });

  it("doesn't match when the platforms differ", () => {
    expect(ownershipPlatformsOverlap(['pc'], ['ps5'])).toBe(false);
  });

  it('treats an unknown (empty) platform list as matching anything', () => {
    expect(ownershipPlatformsOverlap([], ['ps5'])).toBe(true);
    expect(ownershipPlatformsOverlap(['pc'], [])).toBe(true);
    expect(ownershipPlatformsOverlap([], [])).toBe(true);
  });
});
