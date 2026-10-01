import { describe, expect, it } from 'vitest';
import { initialsOf } from './primitives';

describe('initialsOf', () => {
  it('uses the first letter of the first two words', () => {
    expect(initialsOf('PS5 Night')).toBe('PN');
    expect(initialsOf('Friday Co-op')).toBe('FC');
  });

  it('skips symbols instead of showing them', () => {
    expect(initialsOf('Trent & Grace')).toBe('TG');
    expect(initialsOf('Trent&Grace')).toBe('TG');
    expect(initialsOf('& Friends')).toBe('FR');
    expect(initialsOf('🎮 Game Night')).toBe('GN');
  });

  it("drops apostrophes so a possessive isn't split into its own word", () => {
    expect(initialsOf("Trent's Room")).toBe('TR');
    expect(initialsOf('Trent’s Room')).toBe('TR');
  });

  it('takes two letters from a single word, and keeps non-Latin letters', () => {
    expect(initialsOf('Trent')).toBe('TR');
    expect(initialsOf('Zoë Ånd')).toBe('ZÅ');
  });

  it('falls back to ? when there are no letters or digits', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(' & !! ')).toBe('?');
  });
});
