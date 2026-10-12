import { describe, expect, it } from 'vitest';
import { pickAccentColour } from './pictureColour';

/** RGBA pixels: `count` copies of each [r,g,b,a] colour. */
const pixels = (...groups: [number[], number][]) => groups.flatMap(([rgba, count]) => Array.from({ length: count }, () => rgba).flat());

const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};

describe('pickAccentColour', () => {
  it('picks the hue the vivid pixels agree on', () => {
    const out = pickAccentColour(pixels([[200, 40, 40, 255], 80], [[40, 40, 200, 255], 20]))!;
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    const h = hue(out);
    expect(h < 30 || h > 330).toBe(true); // red wins over blue
  });

  it('ignores white, black, grey and transparent pixels', () => {
    const out = pickAccentColour(
      pixels([[255, 255, 255, 255], 200], [[0, 0, 0, 255], 200], [[128, 128, 128, 255], 200], [[255, 0, 0, 0], 200], [[30, 160, 60, 255], 5]),
    )!;
    const h = hue(out);
    expect(h > 100 && h < 150).toBe(true); // the few green pixels are the only colour
  });

  it('returns null for a picture with no colour in it', () => {
    expect(pickAccentColour(pixels([[120, 120, 120, 255], 100]))).toBeNull();
    expect(pickAccentColour([])).toBeNull();
  });
});
