import { describe, expect, it } from 'vitest';
import { ANAGRAM_WORDS } from './anagramList.js';
import { ChainGame } from './chain.js';

const STEP = 50;
const run = (g: ChainGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: ChainGame) => g.snapshot();
const me = (g: ChainGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7, limitS: number | null = null) {
  const g = new ChainGame(lcg(seed));
  g.timeLimitS = limitS;
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

function toAsk(g: ChainGame) {
  for (let i = 0; i < 400; i++) {
    const s = snap(g);
    if (s.stage === 'ask') return s;
    g.tick(STEP);
  }
  throw new Error('no question came up');
}

/** The panel with the word that starts with the letter asked for (the only one that does). */
const rightPanel = (g: ChainGame) => {
  const s = snap(g);
  return s.choices.findIndex((w) => w[0] === s.letter);
};

describe('ChainGame', () => {
  it('shows a word and four answers, exactly one of which starts with its last letter', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = started(['a'], seed);
      for (let q = 0; q < 6; q++) {
        const s = toAsk(g);
        expect(ANAGRAM_WORDS, `seed ${seed}`).toContain(s.question);
        expect(s.letter).toBe(s.question.slice(-1));
        expect(s.choices).toHaveLength(4);
        expect(s.choices.filter((w) => w[0] === s.letter)).toHaveLength(1);
        expect(s.answer).toBe(-1);
        g.tap('a', rightPanel(g));
        run(g, 1500);
      }
    }
  });

  it('makes the answer the next word on show, so the answers make a chain, and does not repeat a word', () => {
    const g = started(['a'], 9);
    const seen: string[] = [];
    let last = '';
    for (let q = 0; q < 12; q++) {
      const s = toAsk(g);
      if (last) {
        // Chained unless the last answer was a dead end (then a fresh word starts the chain again).
        if (s.question !== last) expect(ANAGRAM_WORDS.filter((w) => w[0] === last.slice(-1) && !seen.includes(w))).toEqual([]);
      }
      seen.push(s.question);
      last = s.choices[rightPanel(g)];
      g.tap('a', rightPanel(g));
      run(g, 1500);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('scores a right word and costs a life for a wrong one in an endless run', () => {
    const right = started(['a']);
    toAsk(right);
    right.tap('a', rightPanel(right));
    expect(me(right, 'a')).toMatchObject({ right: true });
    expect(me(right, 'a').meters).toBeGreaterThan(0);
    const wrong = started(['a']);
    toAsk(wrong);
    wrong.tap('a', (rightPanel(wrong) + 1) % 4);
    expect(me(wrong, 'a')).toMatchObject({ right: false, lives: 2 });
  });

  it('can be played for a minute by a bot that knows the rule, which keeps scoring', () => {
    for (const seed of [1, 2, 3]) {
      const g = started(['a'], seed, 60);
      for (let i = 0; i < 1300 && snap(g).phase === 'playing'; i++) {
        if (snap(g).stage === 'ask' && !me(g, 'a').answered) g.tap('a', rightPanel(g));
        g.tick(STEP);
      }
      expect(snap(g).meters, `seed ${seed}`).toBeGreaterThan(20);
    }
  });

  it('makes the same chain for the same seed', () => {
    const chain = (seed: number) => {
      const g = started(['a'], seed);
      const words: string[] = [];
      for (let i = 0; i < 5; i++) {
        words.push(toAsk(g).question);
        g.tap('a', rightPanel(g));
        run(g, 1500);
      }
      return words.join(' ');
    };
    expect(chain(4)).toBe(chain(4));
    expect(chain(4)).not.toBe(chain(5));
  });
});
