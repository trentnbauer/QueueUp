import { describe, expect, it } from 'vitest';
import { MEMORY_PANELS } from '../spinLobby.js';
import { MemoryGame } from './memory.js';

const STEP = 33;
const run = (g: MemoryGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const me = (g: MemoryGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new MemoryGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Watches the pattern being shown, as a player would, and returns it. */
function watch(g: MemoryGame): number[] {
  const pattern: number[] = [];
  let last = -1;
  for (let i = 0; i < 2000 && g.snapshot().stage === 'show'; i++) {
    const { lit } = g.snapshot();
    if (lit >= 0 && last < 0) pattern.push(lit);
    last = lit;
    g.tick(STEP);
  }
  return pattern;
}

/** Plays a whole round correctly: watch, then tap it back. */
function playRound(g: MemoryGame, ids: string[]) {
  const pattern = watch(g);
  for (const panel of pattern) for (const id of ids) g.tap(id, panel);
  return pattern;
}

describe('MemoryGame', () => {
  it('shows a pattern one panel long first, one panel at a time, then waits for taps', () => {
    const g = started(['a']);
    expect(g.snapshot()).toMatchObject({ phase: 'playing', stage: 'show', length: 1, meters: 0 });
    const pattern = watch(g);
    expect(pattern).toHaveLength(1);
    expect(g.snapshot().stage).toBe('input');
    expect(g.snapshot().inputTotalMs).toBeGreaterThan(0);
    expect(pattern[0]).toBeGreaterThanOrEqual(0);
    expect(pattern[0]).toBeLessThan(MEMORY_PANELS);
  });

  it('makes the pattern one longer each round, starting with the same panels', () => {
    const g = started(['a']);
    const first = playRound(g, ['a']);
    run(g, 1200); // the pause between rounds
    const second = playRound(g, ['a']);
    expect(second).toHaveLength(2);
    expect(second[0]).toBe(first[0]);
    expect(g.snapshot().meters).toBe(1);
  });

  it('counts progress without ever saying which panel, and never sends the pattern ahead of time', () => {
    const g = started(['a', 'b']);
    const pattern = watch(g);
    g.tap('a', pattern[0]);
    const snap = g.snapshot();
    expect(me(g, 'a')).toMatchObject({ progress: 1, done: true });
    expect(me(g, 'b')).toMatchObject({ progress: 0, done: false });
    expect(Object.keys(snap)).not.toContain('pattern');
    // While tapping, no panel is lit: the pattern is not given away again.
    expect(snap.lit).toBe(-1);
  });

  it('knocks out someone who taps a wrong panel, and ignores taps before the pattern is done', () => {
    const g = started(['a', 'b']);
    const early = (MEMORY_PANELS + 1) % MEMORY_PANELS;
    g.tap('a', early); // still showing: ignored
    expect(me(g, 'a').alive).toBe(true);
    const pattern = watch(g);
    g.tap('a', (pattern[0] + 1) % MEMORY_PANELS);
    expect(me(g, 'a').alive).toBe(false);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: 'b' });
  });

  it('knocks out whoever has not tapped the whole pattern when time runs out', () => {
    const g = started(['a', 'b']);
    const pattern = watch(g);
    g.tap('a', pattern[0]); // a is done (a one-panel pattern); b does nothing
    run(g, 6000);
    expect(me(g, 'b').alive).toBe(false);
    expect(g.snapshot().winnerId).toBe('a');
  });

  it('ends a solo run with no winner, with the rounds got through as the score', () => {
    const g = started(['a']);
    playRound(g, ['a']);
    run(g, 1200);
    playRound(g, ['a']);
    run(g, 1200);
    const pattern = watch(g);
    g.tap('a', (pattern[0] + 1) % MEMORY_PANELS);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
    expect(g.snapshot().history.at(-1)?.meters).toBe(2);
  });

  it('is a draw when everyone left is out in the same round', () => {
    const g = started(['a', 'b']);
    watch(g);
    run(g, 8000); // neither taps
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
  });

  it('ignores a tap from someone who arrived mid-run, and a tap on no panel', () => {
    const g = started(['a']);
    g.join('late');
    const pattern = watch(g);
    g.tap('late', pattern[0]);
    g.tap('a', -1);
    g.tap('a', MEMORY_PANELS);
    g.tap('a', 1.5);
    expect(me(g, 'late')).toMatchObject({ alive: false, progress: 0 });
    expect(me(g, 'a')).toMatchObject({ alive: true, progress: 0 });
  });

  it('makes the same pattern for the same seed', () => {
    const patternOf = (seed: number) => {
      const g = started(['a'], seed);
      const out: number[][] = [];
      for (let r = 0; r < 3; r++) {
        out.push(playRound(g, ['a']));
        run(g, 1200);
      }
      return out;
    };
    expect(patternOf(0.4)).toEqual(patternOf(0.4));
  });
});
