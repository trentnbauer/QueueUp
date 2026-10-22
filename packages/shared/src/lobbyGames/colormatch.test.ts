import { describe, expect, it } from 'vitest';
import { COLOR_MATCH_PANELS } from '../spinLobby.js';
import { ColorMatchGame } from './colormatch.js';

const STEP = 33;
const run = (g: ColorMatchGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const me = (g: ColorMatchGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const score = (g: ColorMatchGame, id: string) => me(g, id).meters;

/** The panel a prompt asks for, and one it does not. */
const answer = (p: { ink: number; word: number; mode: 'ink' | 'word' }) => p[p.mode];
const wrongOf = (p: Parameters<typeof answer>[0]) => (answer(p) + 1) % COLOR_MATCH_PANELS;

function started(ids: string[], rng: () => number = lcg(7)) {
  const g = new ColorMatchGame(rng);
  g.timeLimitS = 30; // a timed round (with none the game is endless)
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until a prompt is up, and returns it. */
function waitForPrompt(g: ColorMatchGame, after = 0) {
  for (let i = 0; i < 400; i++) {
    const snap = g.snapshot();
    if (snap.stage === 'prompt' && snap.prompt.n > after) return snap.prompt;
    g.tick(STEP);
  }
  throw new Error('no prompt came up');
}

describe('ColorMatchGame', () => {
  it('counts down, then runs a 30 second round', () => {
    const g = new ColorMatchGame(lcg(1));
    g.timeLimitS = 30;
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(g.snapshot().roundLeftMs).toBeGreaterThan(29_000);
    expect(g.snapshot().limitMs).toBe(30_000);
  });

  it('always writes a colour in the ink of a different one', () => {
    const g = started(['a']);
    let after = 0;
    for (let i = 0; i < 12; i++) {
      const prompt = waitForPrompt(g, after);
      expect(prompt.word).not.toBe(prompt.ink);
      for (const k of [prompt.ink, prompt.word]) {
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThan(COLOR_MATCH_PANELS);
      }
      after = prompt.n;
      g.tap('a', prompt[prompt.mode]);
    }
  });

  it('asks for the ink or the word, mixed up from one prompt to the next', () => {
    const g = started(['a']);
    const seen = new Set<string>();
    let after = 0;
    for (let i = 0; i < 20; i++) {
      const prompt = waitForPrompt(g, after);
      seen.add(prompt.mode);
      after = prompt.n;
      g.tap('a', prompt[prompt.mode]);
    }
    expect([...seen].sort()).toEqual(['ink', 'word']);
    expect('shape' in g.snapshot().prompt).toBe(false);
  });

  it('counts the panel the prompt asks for as right, and the others as wrong', () => {
    for (const mode of ['ink', 'word'] as const) {
      let found = false;
      for (let seed = 1; seed < 60 && !found; seed++) {
        const g = started(['a'], lcg(seed));
        const prompt = waitForPrompt(g);
        if (prompt.mode !== mode) continue;
        found = true;
        const wrong = [0, 1, 2, 3].filter((k) => k !== prompt[mode]);
        g.tap('a', wrong[0]);
        expect(me(g, 'a').right).toBe(false);
        const h = started(['a'], lcg(seed));
        waitForPrompt(h);
        h.tap('a', prompt[mode]);
        expect(me(h, 'a').right).toBe(true);
      }
      expect(found, mode).toBe(true);
    }
  });

  it('scores a right answer 2 if quick and 1 if slow, and a wrong one costs a point, once per prompt', () => {
    const g = started(['a', 'b']);
    const first = waitForPrompt(g);
    g.tap('a', answer(first)); // quick
    g.tap('a', wrongOf(first)); // second tap on the prompt: ignored
    expect(score(g, 'a')).toBe(2);
    expect(me(g, 'a')).toMatchObject({ answered: true, right: true });
    run(g, 2000); // b is slow, then the prompt times out
    const second = waitForPrompt(g, first.n);
    run(g, 1500); // past the quick window
    g.tap('b', answer(second));
    expect(score(g, 'b')).toBe(1);
    const third = waitForPrompt(g, second.n);
    g.tap('b', wrongOf(third));
    expect(score(g, 'b')).toBe(0); // 1 - 1
    g.tap('b', answer(third)); // already answered
    expect(score(g, 'b')).toBe(0);
  });

  it('never goes below zero, and ignores bad targets and taps outside a round', () => {
    const g = new ColorMatchGame(lcg(3));
    g.join('a');
    g.tap('a', 0);
    expect(score(g, 'a')).toBe(0);
    run(g, 3200);
    const prompt = waitForPrompt(g);
    g.tap('a', -1);
    g.tap('a', COLOR_MATCH_PANELS);
    g.tap('a', 1.5);
    expect(me(g, 'a').answered).toBe(false);
    g.tap('a', wrongOf(prompt));
    expect(score(g, 'a')).toBe(0);
  });

  it('moves on when everyone has answered, and shortens prompts as the round goes on', () => {
    const g = started(['a', 'b']);
    const first = waitForPrompt(g);
    const total = g.snapshot().promptTotalMs;
    g.tap('a', answer(first));
    g.tap('b', answer(first));
    run(g, 1000);
    expect(g.snapshot().prompt.n).toBeGreaterThan(first.n);
    run(g, 20_000);
    expect(g.snapshot().promptTotalMs).toBeLessThan(total);
  });

  it('ends after 30 seconds: most points wins, a tie or a solo round has no winner', () => {
    const g = started(['a', 'b']);
    let after = 0;
    for (let t = 0; t < 40_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const snap = g.snapshot();
      if (snap.stage === 'prompt' && snap.prompt.n > after) {
        after = snap.prompt.n;
        g.tap('a', answer(snap.prompt));
      }
      g.tick(STEP);
    }
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: 'a' });

    const tie = started(['a', 'b']);
    run(tie, 31_000);
    expect(tie.snapshot()).toMatchObject({ phase: 'over', winnerId: null });

    const solo = started(['a']);
    run(solo, 31_000);
    expect(solo.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('makes the same prompts for the same seed', () => {
    const prompts = (seed: number) => {
      const g = started(['a'], seeded(seed));
      const out: number[] = [];
      let after = 0;
      for (let i = 0; i < 6; i++) {
        const p = waitForPrompt(g, after);
        after = p.n;
        out.push(p.word * 4 + p.ink);
        g.tap('a', answer(p));
      }
      return out;
    };
    expect(prompts(0.42)).toEqual(prompts(0.42));
  });
});

describe('ColorMatchGame endless (no time limit)', () => {
  function endless(ids: string[], rng: () => number = lcg(7)) {
    const g = new ColorMatchGame(rng);
    ids.forEach((id) => g.join(id));
    run(g, 3200);
    return g;
  }
  const lives = (g: ColorMatchGame, id = 'a') => g.snapshot().players.find((p) => p.id === id)!.lives;

  it('has no clock, and gives everyone three lives (a timed round has none)', () => {
    const g = endless(['a']);
    expect(g.snapshot().limitMs).toBe(0);
    expect(lives(g)).toBe(3);
    expect(started(['a']).snapshot().players[0].lives).toBeNull();
  });

  it('costs a life for a wrong answer, with no point taken off', () => {
    const g = endless(['a']);
    const prompt = waitForPrompt(g);
    g.tap('a', wrongOf(prompt));
    expect(lives(g)).toBe(2);
    expect(score(g, 'a')).toBe(0);
  });

  it('costs a life for each prompt left unanswered, and ends a solo run after three', () => {
    const g = endless(['a']);
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).toBe('over');
    expect(lives(g)).toBe(0);
    expect(g.snapshot().winnerId).toBeNull();
  });

  it('lets someone who answers right carry on past 30 seconds, with the prompts waiting less and less', () => {
    const g = endless(['a']);
    let after = 0;
    let firstAllowed = 0;
    let lastAllowed = 0;
    while (g.snapshot().roundLeftMs === 0 && g.snapshot().phase === 'playing' && after < 400) {
      const prompt = waitForPrompt(g, after);
      after = prompt.n;
      if (!firstAllowed) firstAllowed = g.snapshot().promptTotalMs;
      lastAllowed = g.snapshot().promptTotalMs;
      g.tap('a', answer(prompt));
      if (g.snapshot().run > 1) break;
      // stop after 45 seconds of play
      if (after > 60) break;
    }
    expect(g.snapshot().phase).toBe('playing');
    expect(lives(g)).toBe(3);
    expect(lastAllowed).toBeLessThan(firstAllowed - 600);
    expect(lastAllowed).toBeLessThan(1400);
  });

  it('gives the quick bonus for how long the prompt was in front of them, not how long their answer took to arrive', () => {
    const points = (behind: number) => {
      const g = started(['a']);
      const prompt = waitForPrompt(g);
      // Go on until just past the quick part of the prompt.
      for (let i = 0; i < 300 && g.snapshot().promptLeftMs > g.snapshot().promptTotalMs * 0.5; i++) g.tick(STEP);
      g.pressBehindMs = behind;
      g.tap('a', answer(prompt));
      g.pressBehindMs = 0;
      return score(g, 'a');
    };
    expect(points(0)).toBe(1);
    expect(points(400)).toBe(2);
  });
});
