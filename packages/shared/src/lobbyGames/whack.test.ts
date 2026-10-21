import { describe, expect, it } from 'vitest';
import { WHACK_HOLES } from '../spinLobby.js';
import { WhackGame } from './whack.js';

const STEP = 33;
const run = (g: WhackGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const score = (g: WhackGame, id: string) => g.snapshot().players.find((p) => p.id === id)!.meters;

function started(ids: string[], seed = 0.3) {
  const g = new WhackGame(seeded(seed));
  g.timeLimitS = 30; // a timed round (with none the game is endless)
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until a mole (or bomb) of this kind is up, and returns its hole. */
function waitFor(g: WhackGame, kind: 'mole' | 'bomb'): number {
  for (let i = 0; i < 2000; i++) {
    const index = g.snapshot().holes.findIndex((h) => h.kind === kind);
    if (index >= 0) return index;
    g.tick(STEP);
  }
  throw new Error(`no ${kind} came up`);
}

describe('WhackGame', () => {
  it('counts down, then runs a 30 second round', () => {
    const g = new WhackGame(seeded(0.3));
    g.timeLimitS = 30;
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(g.snapshot().roundLeftMs).toBeGreaterThan(29_000);
    expect(g.snapshot().holes).toHaveLength(WHACK_HOLES);
  });

  it('scores a point for everyone who taps a mole while it is up, not just the first', () => {
    const g = started(['a', 'b']);
    const hole = waitFor(g, 'mole');
    g.tap('a', hole);
    g.tap('b', hole);
    expect(score(g, 'a')).toBe(1);
    expect(score(g, 'b')).toBe(1);
    // It stays up, with both of them on it, in the order they got it.
    expect(g.snapshot().holes[hole]).toMatchObject({ kind: 'mole', by: [0, 1] });
  });

  it('costs one point to tap an empty hole, never below zero', () => {
    const g = started(['a']);
    const empty = g.snapshot().holes.findIndex((h) => h.kind === 'empty');
    g.tap('a', empty);
    expect(score(g, 'a')).toBe(0);
    const hole = waitFor(g, 'mole');
    g.tap('a', hole);
    expect(score(g, 'a')).toBe(1);
    const other = g.snapshot().holes.findIndex((h, i) => i !== hole && h.kind === 'empty');
    g.tap('a', other);
    expect(score(g, 'a')).toBe(0);
  });

  it('costs two points to whack a bomb', () => {
    const g = started(['a']);
    let got = 0;
    while (got < 3) {
      const hole = waitFor(g, 'mole');
      g.tap('a', hole);
      got++;
    }
    const before = score(g, 'a');
    const bomb = waitFor(g, 'bomb');
    g.tap('a', bomb);
    expect(score(g, 'a')).toBe(Math.max(0, before - 2));
    expect(g.snapshot().holes[bomb]).toMatchObject({ kind: 'bomb', by: [0] });
  });

  it('scores a mole once per person, and ignores bad targets', () => {
    const g = started(['a', 'b']);
    const hole = waitFor(g, 'mole');
    g.tap('a', hole);
    g.tap('a', hole);
    g.tap('a', -1);
    g.tap('a', WHACK_HOLES);
    g.tap('a', 1.5);
    expect(score(g, 'a')).toBe(1);
    expect(score(g, 'b')).toBe(0);
  });

  it('keeps moles up for less and less time, and leaves gaps with nothing up', () => {
    const g = started(['a']);
    const ups: number[] = [];
    let emptyGaps = 0;
    let wasEmpty = false;
    for (let t = 0; t < 29_000; t += STEP) {
      g.tick(STEP);
      const holes = g.snapshot().holes;
      for (const h of holes) if (h.upMs > 0) ups.push(h.upMs);
      const empty = holes.every((h) => h.kind === 'empty');
      if (empty && !wasEmpty && t > 2000) emptyGaps++;
      wasEmpty = empty;
    }
    expect(ups[0]).toBeGreaterThan(1500);
    expect(ups.at(-1)!).toBeLessThan(700);
    expect(emptyGaps).toBeGreaterThan(1);
  });

  it('drops a mole that is not whacked', () => {
    const g = started(['a']);
    const hole = waitFor(g, 'mole');
    run(g, 2000);
    expect(g.snapshot().holes[hole].kind).not.toBe('mole');
  });

  it('ignores taps outside a round and from someone who is only watching', () => {
    const g = new WhackGame(seeded(0.3));
    g.join('a');
    g.tap('a', 0);
    expect(score(g, 'a')).toBe(0);
    run(g, 3200);
    g.join('late');
    const hole = waitFor(g, 'mole');
    g.tap('late', hole);
    expect(score(g, 'late')).toBe(0);
    expect(g.snapshot().holes[hole].kind).toBe('mole');
  });

  it('ends after 30 seconds: most points wins, a tie or a solo round has no winner', () => {
    const solo = started(['a']);
    for (let i = 0; i < 1500 && solo.snapshot().phase === 'playing'; i++) {
      const hole = solo.snapshot().holes.findIndex((h) => h.kind === 'mole');
      if (hole >= 0) solo.tap('a', hole);
      solo.tick(STEP);
    }
    expect(solo.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
    expect(solo.snapshot().history.at(-1)?.meters).toBeGreaterThan(0);

    const g = started(['a', 'b']);
    for (let i = 0; i < 1500 && g.snapshot().phase === 'playing'; i++) {
      const hole = g.snapshot().holes.findIndex((h) => h.kind === 'mole');
      if (hole >= 0) g.tap('a', hole);
      g.tick(STEP);
    }
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: 'a' });
    expect(g.snapshot().players.find((p) => p.id === 'a')!.wins).toBe(1);

    const tie = started(['a', 'b']);
    run(tie, 31_000);
    expect(tie.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('shows the same moles for the same seed', () => {
    const seen = (seed: number) => {
      const g = started(['a'], seed);
      const holes: number[] = [];
      for (let i = 0; i < 300; i++) {
        g.tick(STEP);
        const index = g.snapshot().holes.findIndex((h) => h.kind !== 'empty');
        if (index >= 0 && holes.at(-1) !== index) holes.push(index);
      }
      return holes;
    };
    expect(seen(0.4)).toEqual(seen(0.4));
  });
});

describe('WhackGame endless (no time limit)', () => {
  function endless(ids: string[], seed = 0.3) {
    const g = new WhackGame(seeded(seed));
    ids.forEach((id) => g.join(id));
    run(g, 3200);
    return g;
  }
  const lives = (g: WhackGame, id = 'a') => g.snapshot().players.find((p) => p.id === id)!.lives;

  it('has no clock, and gives everyone three lives (a timed round has none)', () => {
    const g = endless(['a']);
    expect(g.snapshot().limitMs).toBe(0);
    expect(lives(g)).toBe(3);
    expect(started(['a']).snapshot().players[0].lives).toBeNull();
  });

  it('costs a life when a mole goes down untapped, and ends a solo run when they are gone', () => {
    const g = endless(['a']);
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).toBe('over');
    expect(lives(g)).toBe(0);
    expect(g.snapshot().winnerId).toBeNull();
  });

  it('costs a life to whack a bomb or to tap an empty hole', () => {
    const g = endless(['a']);
    const empty = g.snapshot().holes.findIndex((h) => h.kind === 'empty');
    g.tap('a', empty);
    expect(lives(g)).toBe(2);
    // Whack every mole until a bomb comes up, then whack that.
    let bomb = -1;
    for (let t = 0; t < 40_000 && bomb < 0; t += STEP) {
      g.snapshot().holes.forEach((h, i) => {
        if (h.kind === 'mole' && !h.by.includes(0)) g.tap('a', i);
      });
      bomb = g.snapshot().holes.findIndex((h) => h.kind === 'bomb');
      if (bomb < 0) g.tick(STEP);
    }
    expect(bomb).toBeGreaterThanOrEqual(0);
    g.tap('a', bomb);
    expect(lives(g)).toBe(1);
  });

  it('lets someone who whacks every mole carry on well past 30 seconds', () => {
    const g = endless(['a']);
    for (let t = 0; t < 45_000 && g.snapshot().phase === 'playing'; t += STEP) {
      g.snapshot().holes.forEach((h, i) => {
        if (h.kind === 'mole' && !h.by.includes(0)) g.tap('a', i);
      });
      g.tick(STEP);
    }
    expect(g.snapshot().phase).toBe('playing');
    expect(lives(g)).toBe(3);
    expect(score(g, 'a')).toBeGreaterThan(30);
  });

  it('keeps moles up for less and less as it goes, to well under a timed round\u2019s shortest', () => {
    const upAt = (seconds: number) => {
      const g = endless(['a']);
      for (let t = 0; t < seconds * 1000 && g.snapshot().phase === 'playing'; t += STEP) {
        g.snapshot().holes.forEach((h, i) => {
          if (h.kind === 'mole' && !h.by.includes(0)) g.tap('a', i);
        });
        g.tick(STEP);
      }
      return Math.max(0, ...g.snapshot().holes.map((h) => h.upMs));
    };
    expect(upAt(42)).toBeLessThan(upAt(6) - 800);
    expect(upAt(42)).toBeLessThan(450);
  });

  it('goes on keeping them up for less, with no floor', () => {
    const g = endless(['a']);
    // Moles come and go with nobody tapping, and no one is put out, so the clock can run.
    (g as unknown as { loseLife: () => void }).loseLife = () => {};
    /** The longest any mole is up for in the 3 seconds from `seconds` into the run. */
    const upAt = (seconds: number) => {
      let longest = 0;
      for (let t = 0; t < 3000; t += STEP) {
        g.tick(STEP);
        longest = Math.max(longest, ...g.snapshot().holes.map((h) => h.upMs));
      }
      return longest;
    };
    run(g, 57_000);
    const early = upAt(60);
    run(g, 57_000);
    const late = upAt(120);
    expect(late).toBeLessThan(early);
    expect(late).toBeLessThan(300);
  });
});
