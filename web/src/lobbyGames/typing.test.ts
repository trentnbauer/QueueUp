import { describe, expect, it } from 'vitest';
import { cleanTyped, typedTargets } from './typing';

const BACK = 27;
const code = (letter: string) => letter.charCodeAt(0) - 97;

describe('cleanTyped', () => {
  it('keeps lower case letters only, up to the length', () => {
    expect(cleanTyped('WoRd', 4)).toBe('word');
    expect(cleanTyped('wo rd!', 4)).toBe('word');
    expect(cleanTyped('wordy', 4)).toBe('word');
    expect(cleanTyped('1234', 4)).toBe('');
  });
});

describe('typedTargets', () => {
  it('sends each letter added, in order', () => {
    expect(typedTargets('', 'ab', BACK)).toEqual([code('a'), code('b')]);
    expect(typedTargets('ab', 'abc', BACK)).toEqual([code('c')]);
  });

  it('sends a Backspace for each letter taken away', () => {
    expect(typedTargets('abc', 'ab', BACK)).toEqual([BACK]);
    expect(typedTargets('abc', '', BACK)).toEqual([BACK, BACK, BACK]);
  });

  it('takes back what differs and types the rest, when a letter in the middle changes', () => {
    expect(typedTargets('abc', 'axc', BACK)).toEqual([BACK, BACK, code('x'), code('c')]);
    expect(typedTargets('cat', 'cot', BACK)).toEqual([BACK, BACK, code('o'), code('t')]);
  });

  it('sends nothing when nothing changed', () => {
    expect(typedTargets('abc', 'abc', BACK)).toEqual([]);
  });

  it('leaves the game with the same letters as the field after any edit', () => {
    // Replay what the game would do with the taps, and check it ends where the field is.
    const replay = (before: string, taps: number[]) => taps.reduce((word, t) => (t === BACK ? word.slice(0, -1) : word + String.fromCharCode(97 + t)), before);
    for (const [before, next] of [['', 'word'], ['word', 'wor'], ['word', 'warp'], ['ab', 'ba'], ['abcd', '']] as const) {
      expect(replay(before, typedTargets(before, next, BACK))).toBe(next);
    }
  });
});
