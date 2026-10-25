import { describe, expect, it } from 'vitest';
import { CountingGame, countsFor } from './counting.js';

const STEP = 50;
const run = (g: CountingGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: CountingGame) => g.snapshot();
const me = (g: CountingGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7, limitS: number | null = null) {
  const g = new CountingGame(lcg(seed));
  g.timeLimitS = limitS;
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until the shapes are on show, and returns how many of the counted kind a player would see. */
function toShow(g: CountingGame) {
  for (let i = 0; i < 400; i++) {
    const s = snap(g);
    if (s.stage === 'show') return { s, seen: s.items.filter((it) => it.kind === s.kind).length };
    g.tick(STEP);
  }
  throw new Error('no shapes came up');
}

/** Counts the shapes while they are on show, waits for the choices, and gives the panel with that count. */
function countAndAnswer(g: CountingGame): number {
  const { seen } = toShow(g);
  for (let i = 0; i < 400 && snap(g).stage !== 'ask'; i++) g.tick(STEP);
  return snap(g).choices.indexOf(String(seen));
}

describe('countsFor', () => {
  it('starts small and grows, with a cap', () => {
    expect(countsFor(0).counted).toBe(3);
    expect(countsFor(10).counted).toBeGreaterThan(countsFor(0).counted);
    expect(countsFor(1000).counted).toBeLessThanOrEqual(14);
    expect(countsFor(1000).other).toBeLessThanOrEqual(8);
  });
});

describe('CountingGame', () => {
  it('shows the shapes first and only then the choices, which are gone from the snapshot once the shapes are', () => {
    const g = started(['a']);
    const { s } = toShow(g);
    expect(s.items.length).toBeGreaterThanOrEqual(5);
    expect(s.choices).toEqual([]);
    expect(s.answer).toBe(-1);
    // Taps during the show do nothing.
    g.tap('a', 0);
    expect(me(g, 'a').answered).toBe(false);
    run(g, 4000);
    const after = snap(g);
    if (after.stage === 'ask') {
      expect(after.items).toEqual([]);
      expect(after.choices).toHaveLength(4);
    }
  });

  it('puts the shapes on distinct spots on the field, none off it', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { s } = toShow(started(['a'], seed));
      const spots = new Set(s.items.map((it) => `${Math.floor(it.x * 6)},${Math.floor(it.y * 5)}`));
      expect(spots.size, `seed ${seed}`).toBe(s.items.length);
      for (const it of s.items) {
        expect(it.x).toBeGreaterThan(0);
        expect(it.x).toBeLessThan(1);
        expect(it.y).toBeGreaterThan(0);
        expect(it.y).toBeLessThan(1);
      }
    }
  });

  it('scores a right count and costs a life for a wrong one in an endless run', () => {
    const right = started(['a']);
    right.tap('a', countAndAnswer(right));
    expect(me(right, 'a')).toMatchObject({ right: true });
    expect(me(right, 'a').meters).toBeGreaterThan(0);
    const wrong = started(['a']);
    const panel = countAndAnswer(wrong);
    wrong.tap('a', (panel + 1) % 4);
    expect(me(wrong, 'a')).toMatchObject({ right: false, lives: 2 });
  });

  it('can be played for a minute by a bot that counts, which keeps scoring', () => {
    for (const seed of [1, 2, 3]) {
      const g = started(['a'], seed, 60);
      let seen = -1;
      for (let i = 0; i < 1300 && snap(g).phase === 'playing'; i++) {
        const s = snap(g);
        if (s.stage === 'show') seen = s.items.filter((it) => it.kind === s.kind).length;
        else if (s.stage === 'ask' && !me(g, 'a').answered) g.tap('a', s.choices.indexOf(String(seen)));
        g.tick(STEP);
      }
      expect(snap(g).meters, `seed ${seed}`).toBeGreaterThan(15);
    }
  });

  it('makes the same shapes for the same seed', () => {
    const first = (seed: number) => JSON.stringify(toShow(started(['a'], seed)).s.items);
    expect(first(5)).toBe(first(5));
    expect(first(5)).not.toBe(first(6));
  });
});
