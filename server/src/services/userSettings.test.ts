import { describe, expect, it } from 'vitest';
import { normalizeProfileSlug } from './userSettings.js';

describe('normalizeProfileSlug', () => {
  it('lowercases and trims', () => {
    expect(normalizeProfileSlug('  Trent-B  ')).toBe('trent-b');
  });

  it('treats empty / null as clearing it', () => {
    expect(normalizeProfileSlug('')).toBeNull();
    expect(normalizeProfileSlug('   ')).toBeNull();
    expect(normalizeProfileSlug(null)).toBeNull();
    expect(normalizeProfileSlug(undefined)).toBeNull();
  });

  it('rejects bad shapes', () => {
    for (const bad of ['ab', 'a'.repeat(31), '-abc', 'abc-', 'has space', 'under_score', 'emoji🙂ok', 'a/b']) {
      expect(() => normalizeProfileSlug(bad), bad).toThrow();
    }
    expect(() => normalizeProfileSlug(42)).toThrow();
  });

  it('rejects anything shaped like a user id so it cannot shadow /u/<id>', () => {
    expect(() => normalizeProfileSlug('123e4567-e89b-12d3-a456-426614174000')).toThrow();
  });

  it('accepts digits and inner hyphens at the length limits', () => {
    expect(normalizeProfileSlug('abc')).toBe('abc');
    expect(normalizeProfileSlug('a'.repeat(30))).toBe('a'.repeat(30));
    expect(normalizeProfileSlug('x-1-y')).toBe('x-1-y');
  });
});
