import { describe, expect, it } from 'vitest';
import { ANAGRAM_BACKSPACE } from '../spinLobby.js';
import { ANAGRAM_WORDS, sortedLetters } from './anagramList.js';
import { AnagramGame } from './anagram.js';

const STEP = 33;
const run = (g: AnagramGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const score = (g: AnagramGame, id: string) => g.snapshot(id).players.find((p) => p.id === id)!.meters;

function started(ids: string[], seed = 7) {
  const g = new AnagramGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until a word is up, and returns its scramble. */
function toWord(g: AnagramGame, after = 0) {
  for (let i = 0; i < 400; i++) {
    const s = g.snapshot();
    if (s.stage === 'play' && s.wordNo > after) return s;
    g.tick(STEP);
  }
  throw new Error('no word came up');
}

/** Finds the tile order that spells a word made of these letters, by trying each word of the list that fits. */
function spell(letters: string): number[] {
  const word = ANAGRAM_WORDS.find((w) => sortedLetters(w) === sortedLetters(letters))!;
  const used = new Set<number>();
  return [...word].map((ch) => {
    const i = [...letters].findIndex((c, k) => c === ch && !used.has(k));
    used.add(i);
    return i;
  });
}

describe('AnagramList', () => {
  it('holds only 3 to 6 letter lower case words, none twice, and plenty of each length', () => {
    for (const w of ANAGRAM_WORDS) expect(w).toMatch(/^[a-z]{3,6}$/);
    expect(new Set(ANAGRAM_WORDS).size).toBe(ANAGRAM_WORDS.length);
    for (const n of [3, 4, 5, 6]) expect(ANAGRAM_WORDS.filter((w) => w.length === n).length).toBeGreaterThanOrEqual(20);
  });

  it('has no two short words made of the same letters, since either would count as the answer', () => {
    const short = ANAGRAM_WORDS.filter((w) => w.length <= 4).map(sortedLetters);
    expect(new Set(short).size).toBe(short.length);
  });
});

describe('AnagramGame', () => {
  it('counts down, then runs a 60 second round', () => {
    const g = new AnagramGame(lcg(1));
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(g.snapshot().limitMs).toBe(60_000);
  });

  it('scrambles a word so that it does not spell itself, and keeps the answer back until the word is over', () => {
    const g = started(['a']);
    let after = 0;
    for (let i = 0; i < 6; i++) {
      const s = toWord(g, after);
      after = s.wordNo;
      expect(s.answer).toBeNull();
      expect(ANAGRAM_WORDS.some((w) => w === s.letters)).toBe(false);
      expect(ANAGRAM_WORDS.some((w) => sortedLetters(w) === sortedLetters(s.letters))).toBe(true);
      for (const t of spell(s.letters)) g.tap('a', t);
    }
  });

  it('starts with three words of 3 letters, then 4, then 5, and 6 from then on', () => {
    const g = started(['a'], 11);
    const lengths: number[] = [];
    let after = 0;
    for (let i = 0; i < 11; i++) {
      const s = toWord(g, after);
      after = s.wordNo;
      lengths.push(s.letters.length);
      for (const t of spell(s.letters)) g.tap('a', t);
    }
    expect(lengths).toEqual([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6]);
  });

  it('scores the first to spell a word, and shows the answer and who got it', () => {
    const g = started(['a', 'b']);
    const s = toWord(g);
    const order = spell(s.letters);
    for (const t of order) g.tap('b', t);
    expect(score(g, 'b')).toBeGreaterThanOrEqual(5);
    const after = g.snapshot();
    expect(after.stage).toBe('between');
    expect(after.solvedBy).toBe('b');
    expect(after.answer).toHaveLength(s.letters.length);
    for (const t of order) g.tap('a', t); // too late: the word is over
    expect(score(g, 'a')).toBe(0);
  });

  it('clears the picks after a wrong word, and takes a pick back with backspace', () => {
    const g = started(['a']);
    const s = toWord(g);
    const right = spell(s.letters);
    g.tap('a', right[0]);
    g.tap('a', right[0]); // already picked: ignored
    expect(g.snapshot('a').mine?.picked).toEqual([right[0]]);
    g.tap('a', ANAGRAM_BACKSPACE);
    expect(g.snapshot('a').mine?.picked).toEqual([]);
    // Every tile in the scrambled order is almost never the answer; if it is, there is nothing to test.
    const wrong = [...right].reverse();
    if (wrong.every((t, i) => t === right[i])) return;
    const word = (order: number[]) => order.map((i) => s.letters[i]).join('');
    if (ANAGRAM_WORDS.includes(word(wrong))) return;
    for (const t of wrong) g.tap('a', t);
    expect(g.snapshot('a').mine?.picked).toEqual([]);
    expect(score(g, 'a')).toBe(0);
  });

  it('accepts another word made of the same letters', () => {
    // heart and earth: whichever the game picked, the other one counts.
    for (let seed = 1; seed < 400; seed++) {
      const g = started(['a'], seed);
      const s = toWord(g);
      const twin = ANAGRAM_WORDS.filter((w) => sortedLetters(w) === sortedLetters(s.letters));
      if (twin.length < 2) continue;
      for (const w of twin) {
        const g2 = started(['a'], seed);
        const s2 = toWord(g2);
        const used = new Set<number>();
        for (const ch of w) {
          const i = [...s2.letters].findIndex((c, k) => c === ch && !used.has(k));
          used.add(i);
          g2.tap('a', i);
        }
        expect(score(g2, 'a'), `${w} for ${s2.letters}`).toBeGreaterThanOrEqual(5);
      }
      return;
    }
  });

  it('moves on when nobody solves a word in time, showing the answer', () => {
    const g = started(['a']);
    const first = toWord(g);
    run(g, 14_500);
    const s = g.snapshot();
    expect(s.stage).toBe('between');
    expect(s.answer).not.toBeNull();
    expect(s.solvedBy).toBeNull();
    expect(toWord(g, first.wordNo).wordNo).toBeGreaterThan(first.wordNo);
  });

  it("never tells one player what another has picked", () => {
    const g = started(['a', 'b']);
    const s = toWord(g);
    g.tap('a', spell(s.letters)[0]);
    expect(g.snapshot('a').mine?.picked).toHaveLength(1);
    expect(g.snapshot('b').mine?.picked).toEqual([]);
    expect(g.snapshot().mine).toBeNull();
    expect(JSON.stringify(g.snapshot('b'))).not.toContain(`"picked":[${spell(s.letters)[0]}`);
  });

  it('ends after 60 seconds: most points wins, a tie or a solo round has no winner', () => {
    const g = started(['a', 'b']);
    let after = 0;
    for (let t = 0; t < 70_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const s = g.snapshot();
      if (s.stage === 'play' && s.wordNo > after) {
        after = s.wordNo;
        for (const i of spell(s.letters)) g.tap('a', i);
      }
      g.tick(STEP);
    }
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: 'a' });

    const tie = started(['a', 'b']);
    run(tie, 62_000);
    expect(tie.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('ignores bad targets and taps from someone only watching', () => {
    const g = started(['a']);
    toWord(g);
    g.tap('a', -1);
    g.tap('a', 99);
    g.tap('a', 1.5);
    expect(g.snapshot('a').mine?.picked).toEqual([]);
    g.join('late');
    g.tap('late', 0);
    expect(g.snapshot('late').mine).toBeNull();
  });
});
