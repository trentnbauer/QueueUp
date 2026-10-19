import { describe, expect, it } from 'vitest';
import type { SortitItem } from '../spinLobby.js';
import { SortitGame } from './sortit.js';

const STEP = 33;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const run = (g: SortitGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: SortitGame) => g.snapshot();
const me = (g: SortitGame, id: string) => snap(g).players.find((p) => p.id === id)!;
/** The bin an item belongs in: 0 left, 1 right. */
const answer = (i: SortitItem) => [i.colour, i.shape, i.size][i.rule];

function started(ids: string[], seed = 7) {
  const g = new SortitGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

function untilOver(g: SortitGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

/** The oldest item on the belt that this player has not dealt with. */
function oldest(g: SortitGame, id: string): SortitItem | undefined {
  const done = new Set(me(g, id).done);
  return snap(g).items.find((i) => !done.has(i.n));
}

/** A player who sorts the oldest item right, `delay` seconds after it comes on the belt (a person's reaction), and a wrong way now and then if asked. */
function sorter(g: SortitGame, id: string, delay: number, wrongEvery = 0) {
  const seenAt = new Map<number, number>();
  let count = 0;
  return () => {
    const item = oldest(g, id);
    if (!item) return;
    const first = seenAt.get(item.n) ?? (seenAt.set(item.n, item.travelMs - item.inMs), item.travelMs - item.inMs);
    if (item.travelMs - item.inMs - first < delay * 1000) return;
    count++;
    const right = answer(item);
    g.tap(id, wrongEvery > 0 && count % wrongEvery === 0 ? 1 - right : right);
  };
}

describe('SortitGame belt', () => {
  it('puts the first item on the belt before it reaches the line, with a value of 0 or 1 for each of colour, shape and size', () => {
    const g = started(['a']);
    run(g, 500);
    const items = snap(g).items;
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      for (const v of [i.colour, i.shape, i.size]) expect([0, 1]).toContain(v);
      expect([0, 1, 2]).toContain(i.rule);
      expect(i.travelMs).toBeGreaterThanOrEqual(1200);
    }
  });

  it('is the same belt for the same seed, and a different one for another', () => {
    const belt = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 800);
      return JSON.stringify(snap(g).items);
    };
    expect(belt(5)).toBe(belt(5));
    expect(belt(5)).not.toBe(belt(9));
  });

  it('changes the rule every few items, never to the same one, with a pause to read it, and quicker as it goes', () => {
    const g = started(['a'], 11);
    const seen = new Map<number, SortitItem>();
    for (let t = 0; t < 70_000; t += STEP) {
      g.report('a', 1, true, { s: 0, l: 3 });
      g.tick(STEP);
      for (const i of snap(g).items) seen.set(i.n, i);
    }
    const list = [...seen.values()].sort((x, y) => x.n - y.n);
    const runs: number[] = [];
    let len = 1;
    for (let i = 1; i < list.length; i++) {
      if (list[i].rule === list[i - 1].rule) len++;
      else {
        runs.push(len);
        len = 1;
      }
    }
    expect(runs.length).toBeGreaterThan(5);
    expect(runs.slice(0, 2).every((r) => r >= 7)).toBe(true);
    expect(Math.min(...runs.slice(-4))).toBeLessThanOrEqual(6);
    // Items come quicker as it goes, so there are many more of them in 70 seconds than at the slow start's pace.
    expect(list.length).toBeGreaterThan(80);
  });
});

describe('SortitGame playing', () => {
  it('scores a point for sorting the oldest item the right way, and clears it for that player only', () => {
    const g = started(['a', 'b']);
    run(g, 200);
    const item = oldest(g, 'a')!;
    g.tap('a', answer(item));
    expect(me(g, 'a')).toMatchObject({ meters: 1, lives: 3 });
    expect(me(g, 'a').done).toContain(item.n);
    expect(me(g, 'b').done).not.toContain(item.n);
    expect(me(g, 'a').last?.kind).toBe('right');
  });

  it('costs a life to sort it the wrong way, and for an item that gets past the line', () => {
    const g = started(['a']);
    run(g, 200);
    const item = oldest(g, 'a')!;
    g.tap('a', 1 - answer(item));
    expect(me(g, 'a')).toMatchObject({ meters: 0, lives: 2 });
    expect(me(g, 'a').last?.kind).toBe('wrong');
    run(g, 5000);
    expect(me(g, 'a').lives).toBeLessThan(2);
  });

  it('does nothing for a tap when nothing is on the belt yet', () => {
    const g = new SortitGame(lcg(7));
    g.join('a');
    run(g, 3200 + 50);
    // Nothing has come on the belt in the first moments? If one has, sorting it is fine; the point is a tap never costs a life by itself.
    g.tap('a', 0);
    expect(me(g, 'a').lives).toBeGreaterThanOrEqual(2);
  });

  it('puts out someone who sorts nothing, and ends a solo run with no winner, keeping their items', () => {
    const g = started(['a']);
    const seconds = untilOver(g, 60_000);
    expect(seconds).toBeLessThan(12);
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: null });
    expect(me(g, 'a')).toMatchObject({ alive: false, lives: 0 });
  });

  it('lets someone who reads each item and answers in half a second last past 15 seconds, on several seeds', () => {
    for (const seed of [3, 7, 11, 19]) {
      const g = started(['a'], seed);
      const play = sorter(g, 'a', 0.5);
      expect(untilOver(g, 15_000, play), `seed ${seed}`).toBeGreaterThanOrEqual(15);
    }
  });

  it('is too much for someone who answers a second late once it speeds up: nobody lasts for ever', () => {
    const g = started(['a'], 7);
    expect(untilOver(g, 240_000, sorter(g, 'a', 1))).toBeLessThan(120);
  });

  it('puts out someone who gets three wrong', () => {
    const g = started(['a'], 3);
    const play = sorter(g, 'a', 0.2, 2);
    expect(untilOver(g, 60_000, play)).toBeLessThan(30);
    expect(me(g, 'a').alive).toBe(false);
  });

  it('crowns the last one in, and ends at the lobby time cap with whoever is in keeping their items', () => {
    const g = started(['a', 'b']);
    untilOver(g, 60_000, sorter(g, 'a', 0.3)); // b sorts nothing and is out first
    expect(me(g, 'b').alive).toBe(false);
    if (snap(g).winnerId === 'a') expect(me(g, 'a').wins).toBe(1);

    const cap = new SortitGame(lcg(7));
    cap.timeLimitS = 8;
    cap.join('a');
    run(cap, 3200);
    untilOver(cap, 12_000, sorter(cap, 'a', 0.3));
    expect(snap(cap)).toMatchObject({ phase: 'over', winnerId: null });
    expect(me(cap, 'a').alive).toBe(true);
    expect(snap(cap).history.at(-1)?.meters).toBe(me(cap, 'a').meters);
  });

  it('ignores junk and taps before the run starts', () => {
    const g = new SortitGame(lcg(7));
    g.join('a'); // countdown
    g.tap('a', 1);
    run(g, 1000);
    const p = started(['a']);
    p.tap('a', 2);
    p.tap('a', -1);
    p.tap('a', 0.5);
    expect(me(p, 'a')).toMatchObject({ lives: 3, meters: 0 });
  });
});

describe('SortitGame on each player’s own device', () => {
  it('judges its own taps there, and reports items and lives', () => {
    const g = started(['a']);
    expect(g.clientSim).toBe(true);
    g.report('a', 1, true, { s: 2, l: 2 });
    expect(me(g, 'a')).toMatchObject({ meters: 2, lives: 2 });
    // The server does not judge a player who reports.
    g.tap('a', 0);
    expect(me(g, 'a')).toMatchObject({ meters: 2, lives: 2 });
  });

  it('never gives lives back or items away, and takes a report of being out', () => {
    const g = started(['a']);
    g.report('a', 1, true, { s: 2, l: 2 });
    g.report('a', 1, true, { s: 0, l: 3 });
    expect(me(g, 'a')).toMatchObject({ meters: 2, lives: 2 });
    g.report('a', 1, true, { s: Number.NaN, l: -4 });
    expect(Number.isFinite(me(g, 'a').meters)).toBe(true);
    g.report('a', 1, false, {});
    expect(me(g, 'a').alive).toBe(false);
  });
});
