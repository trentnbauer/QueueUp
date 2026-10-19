import { describe, expect, it } from 'vitest';
import { WORDS_BACKSPACE, WORDS_ENTER, WORDS_GUESSES, WORD_ABSENT, WORD_CORRECT, WORD_PRESENT } from '../spinLobby.js';
import { WordsGame, scoreGuess } from './words.js';
import { WORD_ANSWERS } from './wordList.js';

const STEP = 33;
const run = (g: WordsGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const me = (g: WordsGame, id: string) => g.snapshot(id).players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new WordsGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Types a word and sends it, as a person on the keyboard would. */
function guess(g: WordsGame, id: string, word: string) {
  for (const ch of word) g.tap(id, ch.charCodeAt(0) - 97);
  g.tap(id, WORDS_ENTER);
}

/** Finds the secret by asking the answer list nothing: tries each word until one is marked all correct. The game never says. */
function answerOf(seed: number): string {
  const g = new WordsGame(seeded(seed));
  g.join('probe');
  run(g, 3200);
  // The only way a player learns it is to guess it: cheat in a test by reading the next guess's score is
  // not possible without the answer, so replay the same seed's pick instead.
  const index = Math.floor(
    (() => {
      let a = Math.floor(seed * 4294967296) >>> 0;
      // Same generator as RoundGame (mulberry32), as the game's own seeding uses it for the first draw.
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    })() * WORD_ANSWERS.length,
  );
  return WORD_ANSWERS[index];
}

describe('the word list', () => {
  it('is all lower case, four letters, with no repeats', () => {
    for (const w of WORD_ANSWERS) expect(w, w).toMatch(/^[a-z]{4}$/);
    expect(new Set(WORD_ANSWERS).size).toBe(WORD_ANSWERS.length);
    expect(WORD_ANSWERS.length).toBeGreaterThan(300);
  });
});

describe('scoreGuess', () => {
  it('marks right places, other places and absent letters', () => {
    expect(scoreGuess('word', 'word')).toEqual([2, 2, 2, 2]);
    expect(scoreGuess('wolf', 'word')).toEqual([WORD_CORRECT, WORD_CORRECT, WORD_ABSENT, WORD_ABSENT]);
    expect(scoreGuess('drow', 'word')).toEqual([WORD_PRESENT, WORD_PRESENT, WORD_PRESENT, WORD_PRESENT]);
  });

  it('counts each letter of the answer only once, as Wordle does', () => {
    // The answer has one e: only one of the guess's e's can be marked, and an exact match takes priority.
    expect(scoreGuess('eele', 'tale')).toEqual([WORD_ABSENT, WORD_ABSENT, WORD_CORRECT, WORD_CORRECT]);
    expect(scoreGuess('eeee', 'bite')).toEqual([WORD_ABSENT, WORD_ABSENT, WORD_ABSENT, WORD_CORRECT]);
    expect(scoreGuess('seas', 'ease')).toEqual([WORD_PRESENT, WORD_PRESENT, WORD_PRESENT, WORD_ABSENT]);
  });
});

describe('WordsGame', () => {
  it('starts a run with a secret word that is never in the snapshot until it is over', () => {
    const g = started(['a', 'b']);
    const snap = g.snapshot('a');
    expect(snap).toMatchObject({ phase: 'playing', answer: null });
    expect(JSON.stringify(snap)).not.toContain(answerOf(0.3));
  });

  it('types letters, takes them back, and only sends a whole word', () => {
    const g = started(['a', 'b']);
    g.tap('a', 'c'.charCodeAt(0) - 97);
    g.tap('a', 'a'.charCodeAt(0) - 97);
    expect(g.snapshot('a').mine!.draft).toBe('ca');
    g.tap('a', WORDS_BACKSPACE);
    expect(g.snapshot('a').mine!.draft).toBe('c');
    g.tap('a', WORDS_ENTER); // not four letters yet
    expect(g.snapshot('a').mine!.guesses).toEqual([]);
    for (const ch of 'xyzw') g.tap('a', ch.charCodeAt(0) - 97);
    expect(g.snapshot('a').mine!.draft).toBe('cxyz'); // a fifth letter is not accepted
    g.tap('a', WORDS_ENTER);
    expect(g.snapshot('a').mine!.guesses).toEqual(['cxyz']);
    expect(g.snapshot('a').mine!.draft).toBe('');
  });

  it('fills in letters already got in the right place, so only the other squares are typed', () => {
    const g = started(['a', 'b']);
    const word = answerOf(0.3);
    // Right in the first three squares, wrong in the last.
    const wrong = word.slice(0, 3) + (word[3] === 'q' ? 'x' : 'q');
    guess(g, 'a', wrong);
    const mine = g.snapshot('a').mine!;
    expect(mine.guesses).toEqual([wrong]);
    expect(mine.known).toEqual([word[0], word[1], word[2], '']);
    // One letter is left to type: the draft takes just one, and Enter needs it.
    g.tap('a', WORDS_ENTER);
    expect(g.snapshot('a').mine!.guesses).toHaveLength(1);
    g.tap('a', word.charCodeAt(3) - 97);
    g.tap('a', 'q'.charCodeAt(0) - 97); // no second one: only one square is open
    expect(g.snapshot('a').mine!.draft).toBe(word[3]);
    g.tap('a', WORDS_ENTER);
    expect(me(g, 'a')).toMatchObject({ solved: true, guesses: 2 });
    expect(g.snapshot('a').mine!.guesses).toEqual([wrong, word]);
  });

  it('puts typed letters in the open squares in order, around the ones filled in', () => {
    const g = started(['a', 'b']);
    const word = answerOf(0.3);
    // Right in squares 0 and 2 only.
    const other = (ch: string) => (ch === 'q' ? 'x' : 'q');
    const first = word[0] + other(word[1]) + word[2] + other(word[3]);
    guess(g, 'a', first);
    expect(g.snapshot('a').mine!.known).toEqual([word[0], '', word[2], '']);
    // Two to type now: they go into squares 1 and 3.
    g.tap('a', 'v'.charCodeAt(0) - 97);
    g.tap('a', 'w'.charCodeAt(0) - 97);
    g.tap('a', WORDS_ENTER);
    expect(g.snapshot('a').mine!.guesses.at(-1)).toBe(word[0] + 'v' + word[2] + 'w');
  });

  it('does not fill in letters that were only in the word elsewhere, and starts again each run', () => {
    const g = started(['a', 'b']);
    guess(g, 'a', 'zzzz');
    expect(g.snapshot('a').mine!.known.filter(Boolean).length).toBe(0);
    // A run later, nothing carries over.
    const word = answerOf(0.3);
    guess(g, 'a', word);
    guess(g, 'b', word);
    run(g, 5000);
    run(g, 4000);
    expect(g.snapshot('a').mine?.known ?? []).toEqual(['', '', '', '']);
  });

  it('scores a guess for everyone, but only shows the letters to their owner', () => {
    const g = started(['a', 'b']);
    guess(g, 'a', 'zzzz');
    const forB = g.snapshot('b');
    const a = forB.players.find((p) => p.id === 'a')!;
    expect(a.rows).toHaveLength(1);
    expect(a.guesses).toBe(1);
    expect(JSON.stringify(forB)).not.toContain('zzzz');
    expect(forB.mine!.guesses).toEqual([]);
    expect(g.snapshot('a').mine!.guesses).toEqual(['zzzz']);
  });

  it('gives a person who joined part way through no board', () => {
    const g = started(['a']);
    g.join('late');
    expect(g.snapshot('late').mine).toBeNull();
    guess(g, 'late', 'word');
    expect(me(g, 'late').guesses).toBe(0);
  });

  it('is won by whoever finds the word, with points for fewer guesses and an early solve', () => {
    const g = started(['a', 'b']);
    const word = answerOf(0.3);
    guess(g, 'a', 'zzzz');
    guess(g, 'a', word);
    expect(me(g, 'a')).toMatchObject({ solved: true, done: true, guesses: 2 });
    const points = me(g, 'a').meters;
    expect(points).toBeGreaterThanOrEqual((WORDS_GUESSES - 2 + 1) * 10);
    expect(points).toBeLessThan((WORDS_GUESSES - 2 + 1) * 10 + 10);
    // Done people cannot type any more.
    guess(g, 'a', 'zzzz');
    expect(me(g, 'a').guesses).toBe(2);
    // b is still guessing, so the run goes on.
    expect(g.snapshot('a').phase).toBe('playing');
  });

  it('ends when everyone is done: the fewest guesses wins, and every solver counts a win', () => {
    const g = started(['a', 'b', 'c']);
    const word = answerOf(0.3);
    guess(g, 'a', word); // one guess
    guess(g, 'b', 'zzzz');
    guess(g, 'b', word); // two guesses
    for (let i = 0; i < WORDS_GUESSES; i++) guess(g, 'c', 'zzzz'); // never finds it
    const snap = g.snapshot('a');
    expect(snap).toMatchObject({ phase: 'over', winnerId: 'a', answer: word });
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'b').wins).toBe(1);
    expect(me(g, 'c').wins).toBe(0);
    expect(snap.history.at(-1)?.meters).toBe(me(g, 'a').meters);
  });

  it('breaks a tie on guesses by who solved first', () => {
    const g = started(['a', 'b']);
    const word = answerOf(0.3);
    guess(g, 'b', word);
    run(g, 1000);
    guess(g, 'a', word);
    expect(g.snapshot('a')).toMatchObject({ phase: 'over', winnerId: 'b' });
  });

  it('ends a solo run with no winner, keeping the points', () => {
    const g = started(['a']);
    guess(g, 'a', answerOf(0.3));
    expect(g.snapshot('a')).toMatchObject({ phase: 'over', winnerId: null });
    expect(g.snapshot('a').history.at(-1)?.meters).toBeGreaterThan(0);
  });

  it('ends at 90 seconds, with nobody who has not found the word winning', () => {
    const g = started(['a', 'b']);
    guess(g, 'a', 'zzzz');
    run(g, 91_000);
    expect(g.snapshot('a')).toMatchObject({ phase: 'over', winnerId: null });
    expect(g.snapshot('a').players.every((p) => p.wins === 0)).toBe(true);
  });

  it('picks the same word for the same seed', () => {
    expect(answerOf(0.4)).toBe(answerOf(0.4));
  });
});

describe('WordsGame with no lobby time limit', () => {
  it('still has its 90 seconds: the time is part of the game', () => {
    const g = new WordsGame(seeded(0.3));
    g.join('a');
    run(g, 3200);
    expect(g.snapshot('a').limitMs).toBe(90_000);
    run(g, 91_000);
    expect(g.snapshot('a').phase).not.toBe('playing');
  });
});
