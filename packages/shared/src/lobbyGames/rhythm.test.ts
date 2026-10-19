import { describe, expect, it } from 'vitest';
import { RHYTHM_LANES } from '../spinLobby.js';
import { RhythmGame } from './rhythm.js';

const STEP = 33;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const run = (g: RhythmGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: RhythmGame) => g.snapshot();
const me = (g: RhythmGame, id: string) => snap(g).players.find((p) => p.id === id)!;

function started(ids: string[], seed = 7) {
  const g = new RhythmGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

function untilOver(g: RhythmGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

/** A player who taps each note as it reaches the line, a little early or late (`spread` seconds, from a fixed random source), and never taps for a note it
 * has already tapped for. */
function dancer(g: RhythmGame, id: string, spread: number, seed = 1) {
  const rng = lcg(seed);
  const offsets = new Map<number, number>();
  const tapped = new Set<number>();
  return () => {
    const mine = me(g, id);
    if (!mine.alive) return;
    for (const note of snap(g).notes) {
      if (tapped.has(note.n) || mine.done.includes(note.n)) continue;
      if (!offsets.has(note.n)) offsets.set(note.n, (rng() + rng() + rng() - 1.5) * 2 * spread * 1000);
      if (note.inMs <= offsets.get(note.n)!) {
        tapped.add(note.n);
        g.tap(id, note.lane);
      }
    }
  };
}

describe('RhythmGame chart', () => {
  it('starts with a lone note after a moment, in one of four lanes, with a warning as it falls', () => {
    const g = started(['a']);
    expect(snap(g).phase).toBe('playing');
    run(g, 1000);
    const notes = snap(g).notes;
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.lane).toBeGreaterThanOrEqual(0);
      expect(n.lane).toBeLessThan(RHYTHM_LANES);
      expect(n.fallMs).toBeGreaterThanOrEqual(1300);
    }
  });

  it('is the same for the same seed, and different for another', () => {
    const chart = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 1500);
      return JSON.stringify(snap(g).notes);
    };
    expect(chart(5)).toBe(chart(5));
    expect(chart(5)).not.toBe(chart(9));
  });

  it('speeds up from 100 to 190 beats a minute over 40 seconds, then no more, with the notes falling quicker', () => {
    const g = started(['a']);
    const keep = () => g.report('a', 1, true, { s: 0, l: 3 });
    expect(snap(g).bpm).toBeLessThanOrEqual(102);
    const fall0 = snap(g).notes[0]?.fallMs ?? 1400;
    for (let t = 0; t < 45_000; t += STEP) {
      keep();
      g.tick(STEP);
    }
    expect(snap(g).bpm).toBe(190);
    expect(Math.min(...snap(g).notes.map((n) => n.fallMs))).toBeLessThan(fall0 - 400);
  });

  it('brings two notes at once (in different lanes) from ten seconds in, and not before', () => {
    const chords = (from: number, to: number) => {
      let found = 0;
      for (const seed of [3, 7, 11, 19]) {
        const g = started(['a'], seed);
        const seen = new Map<number, Set<number>>();
        for (let t = 0; t < to * 1000; t += STEP) {
          g.report('a', 1, true, { s: 0, l: 3 });
          g.tick(STEP);
          if (t < from * 1000) continue;
          for (const n of snap(g).notes) {
            const key = Math.round((n.inMs + t) / 5);
            seen.set(key, (seen.get(key) ?? new Set()).add(n.lane));
          }
        }
        for (const lanes of seen.values()) if (lanes.size > 1) found++;
      }
      return found;
    };
    expect(chords(0, 9)).toBe(0);
    expect(chords(25, 45)).toBeGreaterThan(0);
  });
});

describe('RhythmGame playing', () => {
  /** Ticks until the next note is about to reach the line, and returns it. */
  function nextNote(g: RhythmGame) {
    for (let i = 0; i < 600; i++) {
      const note = snap(g).notes.filter((n) => n.inMs > -100).sort((a, b) => a.inMs - b.inMs)[0];
      if (note && note.inMs <= STEP) return note;
      g.tick(STEP);
    }
    throw new Error('no note came');
  }

  it('scores a great hit two points and a good one a point, and clears the note for that player only', () => {
    const g = started(['a', 'b']);
    const first = nextNote(g);
    g.tap('a', first.lane); // right on it
    expect(me(g, 'a')).toMatchObject({ meters: 2, lives: 3 });
    expect(me(g, 'a').done).toContain(first.n);
    expect(me(g, 'b').done).not.toContain(first.n);
    const second = nextNote(g);
    run(g, 100); // 100 ms late: still a hit, just not a great one
    g.tap('b', second.lane);
    expect(me(g, 'b')).toMatchObject({ meters: 1, lives: 3 });
    expect(me(g, 'b').last?.kind).toBe('good');
  });

  it('costs a life for a tap with no note to hit, and for a note that gets by', () => {
    const g = started(['a']);
    g.tap('a', 0); // nothing near the line yet
    expect(me(g, 'a')).toMatchObject({ lives: 2, meters: 0 });
    expect(me(g, 'a').last?.kind).toBe('wrong');
    // Let a note go by untapped.
    run(g, 4000);
    expect(me(g, 'a').lives).toBeLessThan(2);
  });

  it('puts out someone who taps nothing, and ends a solo run with no winner, keeping their points', () => {
    const g = started(['a']);
    const seconds = untilOver(g, 60_000);
    expect(seconds).toBeLessThan(10);
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: null });
    expect(me(g, 'a')).toMatchObject({ alive: false, lives: 0 });
  });

  it('puts out someone who mashes every lane', () => {
    const g = started(['a']);
    const seconds = untilOver(g, 60_000, () => {
      for (let lane = 0; lane < RHYTHM_LANES; lane++) g.tap('a', lane);
    });
    expect(seconds).toBeLessThan(8);
  });

  it('lets someone who taps on the beat clear every note, and who is nearly on it last past 15 seconds, on several seeds', () => {
    for (const seed of [3, 7, 11]) {
      const perfect = started(['a'], seed);
      const play = dancer(perfect, 'a', 0);
      for (let t = 0; t < 20_000; t += STEP) {
        play();
        perfect.tick(STEP);
      }
      expect(me(perfect, 'a'), `seed ${seed}`).toMatchObject({ alive: true, lives: 3 });
      expect(me(perfect, 'a').meters).toBeGreaterThan(15);

      const nearly = started(['a'], seed);
      const near = dancer(nearly, 'a', 0.04, seed);
      expect(untilOver(nearly, 15_000, near), `seed ${seed}`).toBeGreaterThanOrEqual(15);
    }
  });

  it('is too much for someone who is a tenth of a second out, eventually: nobody lasts for ever', () => {
    const g = started(['a'], 7);
    const play = dancer(g, 'a', 0.1, 4);
    expect(untilOver(g, 240_000, play)).toBeLessThan(120);
  });

  it('crowns the last one in, and ends at the lobby time cap with whoever is still in keeping their points', () => {
    const g = started(['a', 'b']);
    const play = dancer(g, 'a', 0);
    untilOver(g, 60_000, play); // b taps nothing and is out first
    expect(me(g, 'b').alive).toBe(false);
    if (snap(g).winnerId === 'a') expect(me(g, 'a').wins).toBe(1);

    const cap = new RhythmGame(lcg(7));
    cap.timeLimitS = 8;
    cap.join('a');
    run(cap, 3200);
    const keep = dancer(cap, 'a', 0);
    untilOver(cap, 12_000, keep);
    expect(snap(cap)).toMatchObject({ phase: 'over', winnerId: null });
    expect(me(cap, 'a').alive).toBe(true);
    expect(snap(cap).history.at(-1)?.meters).toBe(me(cap, 'a').meters);
  });

  it('ignores junk and taps before the run starts', () => {
    const g = new RhythmGame(lcg(7));
    g.join('a'); // countdown
    g.tap('a', 1);
    run(g, 1000);
    const p = started(['a']);
    p.tap('a', 9);
    p.tap('a', -1);
    p.tap('a', 1.5);
    expect(me(p, 'a')).toMatchObject({ lives: 3, meters: 0 });
  });
});

describe('RhythmGame on each player’s own device', () => {
  it('judges its own taps there, and reports points and lives', () => {
    const g = started(['a']);
    expect(g.clientSim).toBe(true);
    g.report('a', 1, true, { s: 6, l: 2 });
    expect(me(g, 'a')).toMatchObject({ meters: 4, lives: 2 }); // at most a hit's worth more than before, per report
    g.report('a', 1, true, { s: 6, l: 2 });
    expect(me(g, 'a').meters).toBe(6);
    // The server does not judge a player who reports.
    g.tap('a', 0);
    expect(me(g, 'a').lives).toBe(2);
  });

  it('never gives lives back or points away, and takes a report of being out', () => {
    const g = started(['a']);
    g.report('a', 1, true, { s: 4, l: 2 });
    g.report('a', 1, true, { s: 1, l: 3 });
    expect(me(g, 'a')).toMatchObject({ meters: 4, lives: 2 });
    g.report('a', 1, true, { s: Number.NaN, l: -9 });
    expect(Number.isFinite(me(g, 'a').meters)).toBe(true);
    g.report('a', 1, false, {});
    expect(me(g, 'a').alive).toBe(false);
  });
});

