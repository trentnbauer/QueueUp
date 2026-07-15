import { describe, it, expect } from 'vitest';
import { platformFamilies, type IgdbPlatform } from './igdbClient.js';

function names(...n: string[]): IgdbPlatform[] {
  return n.map((name) => ({ name }));
}

describe('platformFamilies', () => {
  it('maps common IGDB platform names to the right family', () => {
    expect(platformFamilies(names('PC (Microsoft Windows)'))).toEqual(['pc']);
    expect(platformFamilies(names('Xbox Series X|S'))).toEqual(['xbox']);
    expect(platformFamilies(names('PlayStation 5'))).toEqual(['playstation']);
    expect(platformFamilies(names('Nintendo Switch'))).toEqual(['switch']);
  });

  it('distinguishes Switch 2 from plain Switch (order-dependent substring match)', () => {
    expect(platformFamilies(names('Nintendo Switch 2'))).toEqual(['switch2']);
    expect(platformFamilies(names('Nintendo Switch'))).toEqual(['switch']);
  });

  it('deduplicates when multiple platform names map to the same family', () => {
    expect(platformFamilies(names('Mac', 'PC (Microsoft Windows)', 'Linux'))).toEqual(['pc']);
  });

  it('collects every distinct family for a multi-platform game', () => {
    const result = platformFamilies(names('PC (Microsoft Windows)', 'Xbox One', 'PlayStation 4', 'Nintendo Switch'));
    expect(new Set(result)).toEqual(new Set(['pc', 'xbox', 'playstation', 'switch']));
  });

  it('returns an empty array for platforms with no recognizable family', () => {
    expect(platformFamilies(names('Wii U 2000'))).toEqual([]);
  });

  it('handles missing/empty input', () => {
    expect(platformFamilies(undefined)).toEqual([]);
    expect(platformFamilies([])).toEqual([]);
    expect(platformFamilies([{ name: undefined }])).toEqual([]);
  });
});
