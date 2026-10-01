import { describe, expect, it } from 'vitest';
import { PLATFORM_ORDER, sortPlatformLabel, sortPlatforms } from './types.js';

describe('platform display order', () => {
  it('lists PC first, then newest hardware first', () => {
    expect(PLATFORM_ORDER[0]).toBe('pc');
    expect(PLATFORM_ORDER.indexOf('switch2')).toBeLessThan(PLATFORM_ORDER.indexOf('ps5'));
    expect(PLATFORM_ORDER.indexOf('ps5')).toBeLessThan(PLATFORM_ORDER.indexOf('ps4'));
    expect(PLATFORM_ORDER.at(-1)).toBe('nes');
  });

  it('sorts platform lists into display order', () => {
    expect(sortPlatforms(['ps4', 'pc', 'switch2'])).toEqual(['pc', 'switch2', 'ps4']);
  });

  it('sorts an IGDB platform label, keeping unknown names last in their original order', () => {
    expect(sortPlatformLabel('Xbox Series X|S, PC (Microsoft Windows), PlayStation 5')).toBe(
      'PC (Microsoft Windows), PlayStation 5, Xbox Series X|S',
    );
    expect(sortPlatformLabel('Amiga, PlayStation 4, Atari ST, Nintendo Switch 2')).toBe('Nintendo Switch 2, PlayStation 4, Amiga, Atari ST');
  });
});
