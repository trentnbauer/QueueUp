import { describe, expect, it } from 'vitest';
import { hexToOklchHue } from './roomTheme';

describe('hexToOklchHue', () => {
  it('puts the primaries where OKLCH does', () => {
    expect(hexToOklchHue('#ff0000')).toBeGreaterThan(20);
    expect(hexToOklchHue('#ff0000')).toBeLessThan(35);
    expect(hexToOklchHue('#00ff00')).toBeGreaterThan(135);
    expect(hexToOklchHue('#00ff00')).toBeLessThan(150);
    expect(hexToOklchHue('#0000ff')).toBeGreaterThan(255);
    expect(hexToOklchHue('#0000ff')).toBeLessThan(270);
  });

  it('rejects things that are not 6-digit hex', () => {
    expect(hexToOklchHue('oklch(0.6 0.13 45)')).toBeNull();
    expect(hexToOklchHue('#fff')).toBeNull();
    expect(hexToOklchHue('')).toBeNull();
  });

  it('always lands in 0-359', () => {
    for (const c of ['#c0693c', '#2e8a63', '#5a73c4', '#b05a9c', '#3b86a3', '#6c9136', '#8a8f7a']) {
      const h = hexToOklchHue(c)!;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});
