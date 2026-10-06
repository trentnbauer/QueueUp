import { describe, expect, it } from 'vitest';
import { fitsInstallSize, parseInstallSize } from './installSize';

describe('fitsInstallSize', () => {
  it('has no limit at 0', () => {
    expect(fitsInstallSize({ downloadSizeMb: 999999 }, 0)).toBe(true);
  });

  it('keeps games at or under the limit and games with no known size', () => {
    expect(fitsInstallSize({ downloadSizeMb: 10 * 1024 }, 10)).toBe(true);
    expect(fitsInstallSize({ downloadSizeMb: 10 * 1024 + 1 }, 10)).toBe(false);
    expect(fitsInstallSize({ downloadSizeMb: null }, 10)).toBe(true);
  });
});

describe('parseInstallSize', () => {
  it('reads a whole number of GB and treats anything else as no limit', () => {
    expect(parseInstallSize('50')).toBe(50);
    for (const bad of [null, '', 'abc', '-5', '2.5', '0', '999999']) expect(parseInstallSize(bad), String(bad)).toBe(0);
  });
});
