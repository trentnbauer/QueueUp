import { describe, expect, it } from 'vitest';
import { MathsGame, mathsSum } from './maths.js';
import { nearNumbers } from './quiz.js';

const STEP = 50;
const run = (g: MathsGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: MathsGame) => g.snapshot();
const me = (g: MathsGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7, limitS: number | null = null) {
  const g = new MathsGame(lcg(seed));
  g.timeLimitS = limitS;
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until the choices are up. */
function toAsk(g: MathsGame) {
  for (let i = 0; i < 400; i++) {
    const s = snap(g);
    if (s.stage === 'ask') return s;
    g.tick(STEP);
  }
  throw new Error('no question came up');
}

/** Works out a sum shown as "a + b", "a − b" or "a × b". */
function solve(text: string): number {
  const [a, op, b] = text.split(' ');
  return op === '+' ? Number(a) + Number(b) : op === '−' ? Number(a) - Number(b) : Number(a) * Number(b);
}

/** The panel that is right, worked out from the sum on screen (the answer itself is hidden until the question is over). */
const rightPanel = (g: MathsGame) => {
  const s = snap(g);
  return s.choices.indexOf(String(solve(s.question)));
};

describe('mathsSum and nearNumbers', () => {
  it('gets bigger as questions go by, and always has a whole, non-negative answer', () => {
    const rng = lcg(3);
    for (const asked of [0, 5, 12, 25]) for (let i = 0; i < 100; i++) expect(mathsSum(asked, rng).answer).toBeGreaterThanOrEqual(0);
    const small = Math.max(...Array.from({ length: 50 }, () => mathsSum(0, rng).answer));
    const big = Math.max(...Array.from({ length: 50 }, () => mathsSum(25, rng).answer));
    expect(big).toBeGreaterThan(small);
  });

  it('gives sums whose text works out to the answer', () => {
    const rng = lcg(11);
    for (const asked of [0, 5, 12, 25]) for (let i = 0; i < 50; i++) {
      const s = mathsSum(asked, rng);
      expect(solve(s.text)).toBe(s.answer);
    }
  });

  it('gives three different wrong answers, none the right one, none below the floor, even when the answer is small', () => {
    const rng = lcg(5);
    for (const answer of [0, 1, 4, 30, 200]) {
      const wrong = nearNumbers(answer, 3, 0, rng);
      expect(new Set([answer, ...wrong]).size).toBe(4);
      for (const w of wrong) expect(w).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('MathsGame', () => {
  it('asks a sum with four different answers, one of them right, and does not give the right one away early', () => {
    const g = started(['a']);
    expect(snap(g).stage).not.toBe('ask');
    const s = toAsk(g);
    expect(s.choices).toHaveLength(4);
    expect(new Set(s.choices).size).toBe(4);
    expect(rightPanel(g)).toBeGreaterThanOrEqual(0);
    expect(s.answer).toBe(-1);
  });

  it('scores two for a quick right answer and one for a slow one, and shows which panel was right once it is over', () => {
    const g = started(['a', 'b']);
    toAsk(g);
    g.tap('a', rightPanel(g));
    run(g, 2000);
    g.tap('b', rightPanel(g));
    expect(me(g, 'a')).toMatchObject({ meters: 2, answered: true, right: true });
    expect(me(g, 'b')).toMatchObject({ meters: 1, right: true });
    run(g, 200);
    expect(snap(g).stage).toBe('between');
    expect(snap(g).answer).toBe(snap(g).choices.indexOf(String(solve(snap(g).question))));
  });

  it('counts only the first tap on a question, and ignores a tap that names no panel', () => {
    const g = started(['a', 'b']);
    toAsk(g);
    g.tap('a', 9);
    g.tap('a', -1);
    g.tap('a', 1.5);
    expect(me(g, 'a').answered).toBe(false);
    const right = rightPanel(g);
    g.tap('a', right);
    g.tap('a', right);
    g.tap('a', (right + 1) % 4);
    expect(me(g, 'a').meters).toBe(2);
  });

  it('costs a life for a wrong answer in an endless run, and a point in a timed round, never going below zero', () => {
    const endless = started(['a']);
    toAsk(endless);
    endless.tap('a', (rightPanel(endless) + 1) % 4);
    expect(me(endless, 'a')).toMatchObject({ lives: 2, right: false });
    const timed = started(['a'], 7, 30);
    toAsk(timed);
    timed.tap('a', (rightPanel(timed) + 1) % 4);
    expect(me(timed, 'a')).toMatchObject({ meters: 0, lives: null });
  });

  it('puts a player out after three wrong answers or three questions left unanswered in an endless run', () => {
    const wrong = started(['a']);
    for (let i = 0; i < 3; i++) {
      toAsk(wrong);
      wrong.tap('a', (rightPanel(wrong) + 1) % 4);
      run(wrong, 1500);
    }
    expect(snap(wrong).phase).toBe('over');
    const idle = started(['a']);
    for (let i = 0; i < 600 && snap(idle).phase !== 'over'; i++) idle.tick(STEP);
    expect(snap(idle).phase).toBe('over');
  });

  it('can be played for a minute by a bot that works the sums out, which keeps scoring and never goes out', () => {
    for (const seed of [1, 2, 3, 4]) {
      const g = started(['a'], seed, 60);
      for (let i = 0; i < 1200; i++) {
        const s = snap(g);
        if (s.stage === 'ask' && !me(g, 'a').answered) g.tap('a', rightPanel(g));
        g.tick(STEP);
      }
      expect(snap(g).meters, `seed ${seed}`).toBeGreaterThan(20);
    }
  });

  it('ends a timed round after 30 seconds with the most points winning, and nobody winning a tie or a solo round', () => {
    const g = started(['a', 'b'], 7, 30);
    for (let i = 0; i < 700 && snap(g).phase === 'playing'; i++) {
      if (snap(g).stage === 'ask' && !me(g, 'a').answered) g.tap('a', rightPanel(g));
      g.tick(STEP);
    }
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: 'a' });
    const solo = started(['a'], 7, 30);
    for (let i = 0; i < 700 && snap(solo).phase === 'playing'; i++) {
      if (snap(solo).stage === 'ask' && !solo.snapshot().players[0].answered) solo.tap('a', rightPanel(solo));
      solo.tick(STEP);
    }
    expect(snap(solo)).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('makes the same questions for the same seed', () => {
    const questions = (seed: number) => {
      const g = started(['a'], seed);
      const seen: string[] = [];
      for (let i = 0; i < 4; i++) {
        seen.push(toAsk(g).question);
        g.tap('a', rightPanel(g));
        run(g, 1500);
      }
      return seen.join('|');
    };
    expect(questions(5)).toBe(questions(5));
    expect(questions(5)).not.toBe(questions(6));
  });
});
