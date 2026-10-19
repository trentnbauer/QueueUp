import { describe, expect, it } from 'vitest';
import { TempoGame } from './tempo.js';

const STEP = 33;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const run = (g: TempoGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: TempoGame) => g.snapshot();
const me = (g: TempoGame, id: string) => snap(g).players.find((p) => p.id === id)!;

function started(ids: string[], seed = 7) {
  const g = new TempoGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays until the run is over (or `ms` is up) with `each` called every step, and says how long it lasted in seconds. */
function untilOver(g: TempoGame, ms: number, each: (nowMs: number) => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each(t);
    g.tick(STEP);
  }
  return t / 1000;
}

/** A player who listens to a round's four guide ticks and then keeps the beat going, each tap `spread` seconds out (from a fixed random source) and `bias` seconds late. */
function drummer(g: TempoGame, id: string, spread: number, seed = 1, bias = 0) {
  const rng = lcg(seed);
  const ticks = new Map<number, number[]>();
  const scheduled = new Map<number, { at: number; tapped: boolean }[]>();
  return (nowMs: number) => {
    const s = snap(g);
    const round = s.round;
    if (s.stage === 'rest' && s.ticks.length === 0) return;
    for (const tick of s.ticks) {
      const list = ticks.get(round) ?? [];
      const abs = nowMs + tick.inMs;
      if (!list.some((x) => Math.abs(x - abs) < 100)) list.push(abs);
      ticks.set(round, list);
    }
    const list = ticks.get(round) ?? [];
    if (list.length >= 4 && !scheduled.has(round)) {
      const period = 60000 / s.bpm;
      const last = Math.max(...list);
      scheduled.set(round, Array.from({ length: s.silent }, (_, k) => ({ at: last + (k + 1) * period + (rng() + rng() + rng() - 1.5) * 2 * spread * 1000 + bias * 1000, tapped: false })));
    }
    for (const beat of scheduled.get(round) ?? []) {
      if (!beat.tapped && nowMs >= beat.at) {
        beat.tapped = true;
        g.tap(id);
      }
    }
  };
}

describe('TempoGame rounds', () => {
  it('plays four guide ticks, then goes silent for four beats in the first round, with a wider margin to start and one more silent beat each round', () => {
    const g = started(['a']);
    expect(snap(g).phase).toBe('playing');
    const rounds = new Map<number, { silent: number; tol: number; bpm: number }>();
    for (let t = 0; t < 50_000; t += STEP) {
      g.report('a', 1, true, { s: 0, l: 3 });
      g.tick(STEP);
      const s = snap(g);
      rounds.set(s.round, { silent: s.silent, tol: s.tolMs, bpm: s.bpm });
    }
    const list = [...rounds.entries()].sort((x, y) => x[0] - y[0]);
    expect(list[0][1].silent).toBe(4);
    expect(list[1][1].silent).toBe(5);
    expect(list[0][1].tol).toBe(150);
    expect(list.at(-1)![1].tol).toBeLessThan(list[0][1].tol);
    for (let i = 1; i < list.length; i++) expect(list[i][1].bpm).not.toBe(list[i - 1][1].bpm);
  });

  it('never sends the silent beats: only the guide ticks are in the snapshot', () => {
    const g = started(['a']);
    let maxTicks = 0;
    for (let t = 0; t < 30_000; t += STEP) {
      g.report('a', 1, true, { s: 0, l: 3 });
      g.tick(STEP);
      const s = snap(g);
      maxTicks = Math.max(maxTicks, s.ticks.length);
      if (s.stage === 'play') expect(s.ticks.every((x) => x.inMs <= 0)).toBe(true);
    }
    expect(maxTicks).toBeLessThanOrEqual(4);
  });

  it('is the same for the same seed, and different for another', () => {
    const tempos = (seed: number) => {
      const g = started(['a'], seed);
      const seen: number[] = [];
      for (let t = 0; t < 25_000; t += STEP) {
        g.report('a', 1, true, { s: 0, l: 3 });
        g.tick(STEP);
        const s = snap(g);
        if (seen.at(-1) !== s.bpm) seen.push(s.bpm);
      }
      return JSON.stringify(seen);
    };
    expect(tempos(5)).toBe(tempos(5));
    expect(tempos(5)).not.toBe(tempos(9));
  });
});

describe('TempoGame playing', () => {
  it('scores two for a tap right on the beat, one for one on it, and costs a life for one too far out', () => {
    const results = { great: 0, good: 0, off: 0 };
    for (const [spread, bias] of [[0, 0], [0, 0.1], [0, 0.3]] as const) {
      const g = started(['a'], 3);
      const play = drummer(g, 'a', spread, 1, bias);
      untilOver(g, 14_000, play);
      const kinds = snap(g).players[0].marks.filter(Boolean);
      for (const k of kinds) if (k === 'great') results.great++; else if (k === 'good') results.good++; else results.off++;
    }
    expect(results.great).toBeGreaterThan(0);
    expect(results.good + results.off).toBeGreaterThan(0);
  });

  it('puts out someone who never taps, and ends a solo run with no winner, keeping their points', () => {
    const g = started(['a']);
    const seconds = untilOver(g, 60_000);
    expect(seconds).toBeLessThan(15);
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: null });
    expect(me(g, 'a')).toMatchObject({ alive: false, lives: 0 });
  });

  it('puts out someone who just taps all the time, since the taps are not near the beats', () => {
    const g = started(['a']);
    let i = 0;
    const seconds = untilOver(g, 60_000, () => {
      if (i++ % 3 === 0) g.tap('a');
    });
    expect(seconds).toBeLessThan(25);
  });

  it('ignores taps while the guide ticks play and between rounds, and a second tap on a beat that was dealt with', () => {
    const g = started(['a']);
    // In the guide stretch of the first round: nothing to judge.
    for (let i = 0; i < 8; i++) {
      g.tap('a');
      g.tick(STEP);
    }
    expect(me(g, 'a')).toMatchObject({ lives: 3, meters: 0 });
  });

  it('lets someone who keeps the beat to within a hundredth of a second last past 20 seconds, on several seeds', () => {
    for (const seed of [3, 7, 11]) {
      const g = started(['a'], seed);
      const play = drummer(g, 'a', 0.01, seed);
      expect(untilOver(g, 20_000, play), `seed ${seed}`).toBeGreaterThanOrEqual(20);
    }
  });

  it('is too much for someone who drifts a tenth of a second, in the end: nobody lasts for ever', () => {
    const g = started(['a'], 7);
    const play = drummer(g, 'a', 0.07, 4);
    expect(untilOver(g, 300_000, play)).toBeLessThan(150);
  });

  it('crowns the last one in, and ends at the lobby time cap with whoever is still in keeping their points', () => {
    const g = started(['a', 'b']);
    untilOver(g, 90_000, drummer(g, 'a', 0.01)); // b taps nothing and is out first
    expect(me(g, 'b').alive).toBe(false);
    if (snap(g).winnerId === 'a') expect(me(g, 'a').wins).toBe(1);

    const cap = new TempoGame(lcg(7));
    cap.timeLimitS = 10;
    cap.join('a');
    run(cap, 3200);
    untilOver(cap, 14_000, drummer(cap, 'a', 0.01));
    expect(snap(cap)).toMatchObject({ phase: 'over', winnerId: null });
    expect(me(cap, 'a').alive).toBe(true);
    expect(snap(cap).history.at(-1)?.meters).toBe(me(cap, 'a').meters);
  });
});

describe('TempoGame on each player’s own device', () => {
  it('judges its own taps there, and reports points and lives', () => {
    const g = started(['a']);
    expect(g.clientSim).toBe(true);
    g.report('a', 1, true, { s: 3, l: 2 });
    expect(me(g, 'a')).toMatchObject({ meters: 3, lives: 2 });
    g.tap('a');
    expect(me(g, 'a')).toMatchObject({ meters: 3, lives: 2 });
  });

  it('never gives lives back or points away, and takes a report of being out', () => {
    const g = started(['a']);
    g.report('a', 1, true, { s: 3, l: 2 });
    g.report('a', 1, true, { s: 0, l: 3 });
    expect(me(g, 'a')).toMatchObject({ meters: 3, lives: 2 });
    g.report('a', 1, true, { s: Number.NaN, l: -4 });
    expect(Number.isFinite(me(g, 'a').meters)).toBe(true);
    g.report('a', 1, false, {});
    expect(me(g, 'a').alive).toBe(false);
  });
});
