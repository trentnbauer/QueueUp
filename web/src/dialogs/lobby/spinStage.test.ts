import { describe, expect, it } from 'vitest';
import { showMiniGameFirst } from './spinStage';

const room = { inRoom: true, hasSpin: false, spinLoaded: true, stage: 'game' as const };

describe('showMiniGameFirst', () => {
  it('shows the mini game first in a room with no spin', () => {
    expect(showMiniGameFirst(room)).toBe(true);
  });

  it('moves on to the spin menu once the person has chosen to', () => {
    expect(showMiniGameFirst({ ...room, stage: 'menu' })).toBe(false);
  });

  it('gives way to the spin screens as soon as there is a spin, even if the mini game was showing', () => {
    expect(showMiniGameFirst({ ...room, hasSpin: true })).toBe(false);
  });

  it('waits for the room\'s spin to be fetched, so it never flashes in front of a waiting spin', () => {
    expect(showMiniGameFirst({ ...room, spinLoaded: false })).toBe(false);
  });

  it('is never used on the Personal Shelf', () => {
    expect(showMiniGameFirst({ ...room, inRoom: false })).toBe(false);
  });
});
