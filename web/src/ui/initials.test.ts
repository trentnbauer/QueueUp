import { describe, expect, it } from 'vitest';
import { initialsOf, roomInitials } from './primitives';

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

describe('roomInitials', () => {
  it('uses a short name the Room Master set, capped at four', () => {
    expect(roomInitials('Friday Night', 'fn')).toBe('FN');
    expect(roomInitials('Friday Night', 'abcdef')).toBe('ABCD');
    expect(roomInitials('Friday Night', '  ')).toBe('FN');
  });

  it('takes the first letter of each word, up to four', () => {
    expect(roomInitials('PS5 Night')).toBe('PN');
    expect(roomInitials('Friday Night Co-op')).toBe('FNCO');
    expect(roomInitials("Trent's Big Gaming Room Of Doom")).toBe('TBGR');
  });

  it('takes the consonants of a single word', () => {
    expect(roomInitials('Trent')).toBe('TRNT');
    expect(roomInitials('Friday')).toBe('FRDY');
    expect(roomInitials('Squad')).toBe('SQD');
  });

  it('falls back to the letters when a single word has no consonants, and to ? with nothing', () => {
    expect(roomInitials('AI')).toBe('AI');
    expect(roomInitials('')).toBe('?');
  });
});
