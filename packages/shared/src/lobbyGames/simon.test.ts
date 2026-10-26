import { describe, expect, it } from 'vitest';
import { SimonGame, litFor } from './simon.js';

const STEP = 50;
const run = (g: SimonGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: SimonGame) => g.snapshot();
const me = (g: SimonGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new SimonGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until it is `id`'s turn to tap, watching which pads light up (the only way to learn the pattern, as a player does). */
function watchTurn(g: SimonGame, id: string, pattern: number[]): void {
  for (let i = 0; i < 800; i++) {
    const s = snap(g);
    if (s.turnId === id && s.stage === 'input') return;
    g.tick(STEP);
  }
  void pattern;
  throw new Error(`no turn for ${id}`);
}

/** A player who remembers every pad that has been added (the new one is whatever they tap) and plays their turns perfectly. */
class Player {
  readonly pattern: number[] = [];
  constructor(
    private readonly g: SimonGame,
    private readonly id: string,
  ) {}
  /** Plays the turn that is on if it is theirs; returns whether it played one. */
  turn(): boolean {
    const s = snap(this.g);
    if (s.turnId !== this.id || s.stage !== 'input') return false;
    for (const pad of this.pattern) this.g.tap(this.id, pad);
    const added = this.pattern.length % 4;
    this.g.tap(this.id, added);
    this.pattern.push(added);
    return true;
  }
}

describe('litFor', () => {
  it('gets quicker as the pattern grows, down to a floor', () => {
    expect(litFor(1)).toBeGreaterThan(litFor(10));
    expect(litFor(1000)).toBeCloseTo(litFor(2000), 5);
    expect(litFor(1000)).toBeGreaterThan(0.2);
  });
});

describe('SimonGame', () => {
  it('starts with no pattern and the first player to add a pad', () => {
    const g = started(['a', 'b']);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.length).toBe(0);
    expect(s).toMatchObject({ turnId: 'a', stage: 'input' });
  });

  it('adds the pad the player taps on the end of the pattern and passes the turn on', () => {
    const g = started(['a', 'b']);
    g.tap('a', 2);
    expect(snap(g)).toMatchObject({ length: 1, stage: 'between' });
    expect(me(g, 'a').meters).toBe(1);
    run(g, 1000);
    expect(snap(g)).toMatchObject({ turnId: 'b', stage: 'show' });
  });

  it('only listens to the player whose turn it is, and only to real pads', () => {
    const g = started(['a', 'b']);
    g.tap('b', 1);
    expect(snap(g).length).toBe(0);
    g.tap('a', 7);
    g.tap('a', -1);
    g.tap('a', 0.5);
    expect(snap(g).length).toBe(0);
    expect(me(g, 'a').alive).toBe(true);
  });

  it('shows the pattern a pad at a time, in order, before the turn can be played', () => {
    const g = started(['a', 'b']);
    g.tap('a', 3);
    run(g, 1000);
    const lit: number[] = [];
    for (let i = 0; i < 100 && snap(g).stage === 'show'; i++) {
      const l = snap(g).lit;
      if (l >= 0 && lit[lit.length - 1] !== l) lit.push(l);
      // Tapping while it is shown does nothing.
      g.tap('b', 0);
      g.tick(STEP);
    }
    expect(lit).toEqual([3]);
    expect(snap(g).stage).toBe('input');
    expect(me(g, 'b').alive).toBe(true);
  });

  it('puts a player out for a wrong pad, leaves the pattern as it was, and lets the next player win when they are the last', () => {
    const g = started(['a', 'b']);
    g.tap('a', 1);
    run(g, 1000);
    watchTurn(g, 'b', [1]);
    g.tap('b', 2); // wrong: the first pad was 1
    expect(me(g, 'b').alive).toBe(false);
    expect(snap(g).length).toBe(1);
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: 'a' });
  });

  it('puts a player out who runs out of time, and gives the score as the longest pattern they got through', () => {
    const g = started(['a']);
    g.tap('a', 0);
    run(g, 1000);
    watchTurn(g, 'a', [0]);
    g.tap('a', 0);
    g.tap('a', 1);
    expect(me(g, 'a').meters).toBe(2);
    run(g, 1000);
    watchTurn(g, 'a', [0, 1]);
    for (let i = 0; i < 600 && snap(g).phase !== 'over'; i++) g.tick(STEP);
    expect(snap(g).phase).toBe('over');
    expect(snap(g).history.at(-1)?.meters).toBe(2);
  });

  it('can be played for a long pattern by players who remember it, who keep taking turns', () => {
    const g = started(['a', 'b']);
    const players = [new Player(g, 'a'), new Player(g, 'b')];
    // Each remembers the whole pattern by watching the turns (here, by being told what each added).
    for (let i = 0; i < 4000 && snap(g).length < 12; i++) {
      for (const p of players) {
        const before = p.pattern.length;
        const other = players.find((q) => q !== p)!;
        if (p.turn()) {
          // The other player learns the pad that was added.
          other.pattern.length = 0;
          other.pattern.push(...p.pattern);
          expect(p.pattern.length).toBeGreaterThan(before);
        }
      }
      g.tick(STEP);
    }
    expect(snap(g).length).toBeGreaterThanOrEqual(12);
    expect(snap(g).players.every((p) => p.alive)).toBe(true);
  });

  it('passes the turn on when the player whose turn it is leaves', () => {
    const g = started(['a', 'b', 'c']);
    g.leave('a');
    run(g, 1500);
    expect(snap(g).turnId).toBe('b');
  });
});
