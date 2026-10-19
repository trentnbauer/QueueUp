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

function started(ids: string[], rng: () => number = lcg(7)) {
  const g = new ColorMatchGame(rng);
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
      expect(prompt.ink).toBeGreaterThanOrEqual(0);
      expect(prompt.ink).toBeLessThan(COLOR_MATCH_PANELS);
      after = prompt.n;
      g.tap('a', prompt.ink);
    }
  });

  it('scores a right answer 2 if quick and 1 if slow, and a wrong one costs a point, once per prompt', () => {
    const g = started(['a', 'b']);
    const first = waitForPrompt(g);
    g.tap('a', first.ink); // quick
    g.tap('a', (first.ink + 1) % COLOR_MATCH_PANELS); // second tap on the prompt: ignored
    expect(score(g, 'a')).toBe(2);
    expect(me(g, 'a')).toMatchObject({ answered: true, right: true });
    run(g, 2000); // b is slow, then the prompt times out
    const second = waitForPrompt(g, first.n);
    run(g, 1500); // past the quick window
    g.tap('b', second.ink);
    expect(score(g, 'b')).toBe(1);
    const third = waitForPrompt(g, second.n);
    g.tap('b', (third.ink + 1) % COLOR_MATCH_PANELS);
    expect(score(g, 'b')).toBe(0); // 1 - 1
    g.tap('b', third.ink); // already answered
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
    g.tap('a', (prompt.ink + 1) % COLOR_MATCH_PANELS);
    expect(score(g, 'a')).toBe(0);
  });

  it('moves on when everyone has answered, and shortens prompts as the round goes on', () => {
    const g = started(['a', 'b']);
    const first = waitForPrompt(g);
    const total = g.snapshot().promptTotalMs;
    g.tap('a', first.ink);
    g.tap('b', first.ink);
    run(g, 800);
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
        g.tap('a', snap.prompt.ink);
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
        g.tap('a', p.ink);
      }
      return out;
    };
    expect(prompts(0.42)).toEqual(prompts(0.42));
  });
});
