import { describe, it, expect } from 'vitest';
import { MAX_BUNDLE_GAMES, parseBundleIgdbIds } from './bundleImport.js';

describe('parseBundleIgdbIds', () => {
  it('keeps the ids in order and drops repeats', () => {
    expect(parseBundleIgdbIds([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });

  it('refuses anything that is not a list', () => {
    expect(() => parseBundleIgdbIds(undefined)).toThrow(/list/);
    expect(() => parseBundleIgdbIds(5)).toThrow(/list/);
  });

  it('refuses ids that are not whole positive numbers', () => {
    for (const bad of [[0], [-1], [1.5], ['7'], [null], [NaN]]) {
      expect(() => parseBundleIgdbIds(bad)).toThrow(/whole number/);
    }
  });

  it('needs at least one game', () => {
    expect(() => parseBundleIgdbIds([])).toThrow(/at least one/);
  });

  it('caps the size of a bundle', () => {
    const ok = Array.from({ length: MAX_BUNDLE_GAMES }, (_, i) => i + 1);
    expect(parseBundleIgdbIds(ok)).toHaveLength(MAX_BUNDLE_GAMES);
    expect(() => parseBundleIgdbIds([...ok, MAX_BUNDLE_GAMES + 1])).toThrow(/at most/);
  });
});
