import { describe, expect, it } from 'vitest';
import { BATTLESHIPS_SIZE, SQUARE_HIT, SQUARE_MISS, SQUARE_SUNK, SQUARE_UNKNOWN } from '../spinLobby.js';
import { BattleshipsGame, battleshipsBrain, fleetFor, placeFleet } from './battleships.js';
import { BotFiller, withBots } from './bots.js';
import { mulberry32 } from './roundGame.js';

const SIZE = BATTLESHIPS_SIZE;
const CELLS = SIZE * SIZE;
const STEP = 33;
const seeded = (seed: number) => () => seed;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: BattleshipsGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new BattleshipsGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Where the ships are, which a player cannot see (a test peeks). */
const ships = (g: BattleshipsGame) => (g as unknown as { ships: { cells: number[]; hits: number }[] }).ships;
const shipCells = (g: BattleshipsGame) => new Set(ships(g).flatMap((s) => s.cells));
const water = (g: BattleshipsGame) => Array.from({ length: CELLS }, (_, i) => i).filter((i) => !shipCells(g).has(i));

/** A shot, then long enough to be ready for the next. */
function fire(g: BattleshipsGame, id: string, square: number) {
  g.tap(id, square);
  run(g, 900);
}

describe('fleetFor', () => {
  it('gives fewer players a fuller board of bigger ships, and more players a emptier board of smaller ones', () => {
    const covered = (n: number) => fleetFor(n).reduce((a, b) => a + b, 0);
    const longest = (n: number) => Math.max(...fleetFor(n));
    for (let n = 1; n < 12; n++) {
      expect(covered(n + 1), `${n} to ${n + 1} players`).toBeLessThanOrEqual(covered(n));
      expect(longest(n + 1)).toBeLessThanOrEqual(longest(n));
      expect(fleetFor(n + 1).length).toBeLessThanOrEqual(fleetFor(n).length + 1);
    }
    expect(covered(1)).toBeGreaterThan(covered(12) * 2.5);
    expect(longest(1)).toBe(5);
    expect(longest(12)).toBe(2);
  });

  it('is about 30% of the board for one or two, and about 10% for twelve', () => {
    expect(fleetFor(1).reduce((a, b) => a + b, 0) / CELLS).toBeGreaterThan(0.27);
    expect(fleetFor(1).reduce((a, b) => a + b, 0) / CELLS).toBeLessThan(0.32);
    expect(fleetFor(12).reduce((a, b) => a + b, 0) / CELLS).toBeGreaterThan(0.08);
    expect(fleetFor(12).reduce((a, b) => a + b, 0) / CELLS).toBeLessThan(0.12);
  });

  it('only has ships from 2 to 5 long, longest first, and at least one ship', () => {
    for (let n = 0; n <= 20; n++) {
      const fleet = fleetFor(n);
      expect(fleet.length).toBeGreaterThan(0);
      for (const len of fleet) {
        expect(len).toBeGreaterThanOrEqual(2);
        expect(len).toBeLessThanOrEqual(5);
      }
      expect([...fleet].sort((a, b) => b - a)).toEqual(fleet);
    }
  });
});

describe('placeFleet', () => {
  it('puts every ship on the board in a straight line, with no two overlapping or touching', () => {
    for (let n = 1; n <= 12; n++) {
      for (let seed = 1; seed <= 40; seed++) {
        const fleet = fleetFor(n);
        const placed = placeFleet(mulberry32(seed * 7919 + n), fleet);
        expect(placed.map((s) => s.length), `${n} players, seed ${seed}`).toEqual(fleet);
        const all = placed.flat();
        expect(new Set(all).size).toBe(all.length);
        for (const cells of placed) {
          const xs = cells.map((c) => c % SIZE);
          const ys = cells.map((c) => Math.floor(c / SIZE));
          for (const c of cells) {
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThan(CELLS);
          }
          const flat = new Set(xs).size === 1 || new Set(ys).size === 1;
          expect(flat).toBe(true);
          // Consecutive squares.
          const sorted = [...cells].sort((a, b) => a - b);
          const step = new Set(ys).size === 1 ? 1 : SIZE;
          sorted.forEach((c, i) => i > 0 && expect(c - sorted[i - 1]).toBe(step));
        }
        // Ships do not touch, corners included.
        placed.forEach((a, i) =>
          placed.slice(i + 1).forEach((b) => {
            for (const c of a)
              for (const d of b) {
                const near = Math.abs((c % SIZE) - (d % SIZE)) <= 1 && Math.abs(Math.floor(c / SIZE) - Math.floor(d / SIZE)) <= 1;
                expect(near, `${n} players, seed ${seed}`).toBe(false);
              }
          }),
        );
      }
    }
  });

  it('is the same every time for the same seed, and different for another', () => {
    const fleet = fleetFor(2);
    expect(placeFleet(mulberry32(5), fleet)).toEqual(placeFleet(mulberry32(5), fleet));
    expect(placeFleet(mulberry32(5), fleet)).not.toEqual(placeFleet(mulberry32(6), fleet));
  });
});

describe('BattleshipsGame rounds', () => {
  it('wants two players, and hides a fleet sized for the people who started', () => {
    expect(new BattleshipsGame().minPlayers).toBe(2);
    const two = started(['a', 'b']);
    expect(two.snapshot().fleet.map((s) => s.len)).toEqual(fleetFor(2));
    const twelve = started(Array.from({ length: 12 }, (_, i) => `p${i}`));
    expect(twelve.snapshot().fleet.map((s) => s.len)).toEqual(fleetFor(12));
    expect(two.snapshot().fleet.length).toBeGreaterThan(0);
    expect(twelve.snapshot().fleet.reduce((a, s) => a + s.len, 0)).toBeLessThan(two.snapshot().fleet.reduce((a, s) => a + s.len, 0));
  });

  it('scores a hit, shows who shot it, and shows a miss as a miss', () => {
    const g = started(['a', 'b']);
    const hit = [...shipCells(g)][0];
    const miss = water(g)[0];
    g.tap('a', hit);
    g.tap('b', miss);
    const snap = g.snapshot();
    expect(snap.cells[hit]).toBe(SQUARE_HIT);
    expect(snap.cells[miss]).toBe(SQUARE_MISS);
    expect(snap.by[hit]).toBe(0);
    expect(snap.by[miss]).toBe(1);
    expect(me(g, 'a')).toMatchObject({ meters: 1, shots: 1, hits: 1 });
    expect(me(g, 'b')).toMatchObject({ meters: 0, shots: 1, hits: 0 });
  });

  it('gives a bonus to the shot that sinks a ship, and shows the whole ship sunk', () => {
    const g = started(['a', 'b']);
    const ship = ships(g)[ships(g).length - 1].cells; // the shortest
    for (const c of ship) fire(g, 'a', c);
    const snap = g.snapshot();
    expect(me(g, 'a').meters).toBe(ship.length + 1);
    for (const c of ship) expect(snap.cells[c]).toBe(SQUARE_SUNK);
    expect(snap.fleet.filter((s) => s.sunk)).toHaveLength(1);
  });

  it('lets one person shoot only once in a moment', () => {
    const g = started(['a', 'b']);
    const [first, second] = water(g);
    g.tap('a', first);
    g.tap('a', second);
    expect(g.snapshot().cells[second]).toBe(SQUARE_UNKNOWN);
    expect(me(g, 'a').cooldownMs).toBeGreaterThan(500);
    run(g, 900);
    expect(me(g, 'a').cooldownMs).toBe(0);
    g.tap('a', second);
    expect(g.snapshot().cells[second]).toBe(SQUARE_MISS);
    // Someone else is not held up by it.
    g.tap('b', water(g)[2]);
    expect(me(g, 'b').shots).toBe(1);
  });

  it('ignores a shot at a square already shot, without using up the wait', () => {
    const g = started(['a', 'b']);
    const square = water(g)[0];
    g.tap('a', square);
    run(g, 900);
    g.tap('b', square);
    expect(me(g, 'b').shots).toBe(0);
    g.tap('a', square);
    expect(me(g, 'a').shots).toBe(1);
    // And they can shoot elsewhere straight away.
    g.tap('b', water(g)[1]);
    expect(me(g, 'b').shots).toBe(1);
  });

  it('takes the first shot at a square, when two people go for it', () => {
    const g = started(['a', 'b']);
    const hit = [...shipCells(g)][0];
    g.tap('b', hit);
    g.tap('a', hit);
    expect(me(g, 'b').meters).toBe(1);
    expect(me(g, 'a').meters).toBe(0);
    expect(g.snapshot().by[hit]).toBe(1);
  });

  it('ignores taps that are not on the board, from nobody, before the run, or from someone watching', () => {
    const g = new BattleshipsGame(seeded(0.3));
    g.join('a');
    g.join('b');
    g.tap('a', 0); // countdown
    run(g, 3200);
    expect(g.snapshot().cells.every((c) => c === SQUARE_UNKNOWN)).toBe(true);
    for (const bad of [-1, CELLS, 1.5, Number.NaN, Infinity]) g.tap('a', bad);
    g.tap('nobody', 0);
    expect(me(g, 'a').shots).toBe(0);
    g.join('late'); // arrives during the run: watches
    g.tap('late', water(g)[0]);
    expect(me(g, 'late').shots).toBe(0);
  });

  it('never gives away a ship that has not been shot at', () => {
    const g = started(['a', 'b']);
    expect(g.snapshot().cells.every((c) => c === SQUARE_UNKNOWN)).toBe(true);
    // A hit shows that square, and only that square.
    const hit = [...shipCells(g)][0];
    g.tap('a', hit);
    const cells = g.snapshot().cells;
    expect(cells.filter((c) => c !== SQUARE_UNKNOWN)).toHaveLength(1);
    expect(cells[hit]).toBe(SQUARE_HIT);
    // The fleet list has lengths and sunk flags, nothing about where.
    expect(Object.keys(g.snapshot().fleet[0]).sort()).toEqual(['len', 'sunk']);
  });

  it('ends the round when the whole fleet is sunk: most points wins, and the win is kept', () => {
    const g = started(['a', 'b']);
    const all = ships(g).flatMap((s) => s.cells);
    // `b` takes one square, `a` the rest.
    fire(g, 'b', all[0]);
    for (const c of all.slice(1)) fire(g, 'a', c);
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(snap.history[0]).toMatchObject({ winnerId: 'a', id: 'a', game: 'battleships' });
    expect(snap.history[0].meters).toBe(me(g, 'a').meters);
  });

  it('has no winner when the best are tied', () => {
    const g = started(['a', 'b']);
    // One hit each (not a whole ship), then the time runs out: 1 point each.
    const [first, second] = ships(g)[0].cells;
    fire(g, 'a', first);
    fire(g, 'b', ships(g)[1].cells[0]);
    expect(second).toBeDefined();
    for (let t = 0; t < 100_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBeNull();
    expect(g.snapshot().history[0]).toMatchObject({ winnerId: null, meters: 1 });
    expect(me(g, 'a').wins + me(g, 'b').wins).toBe(0);
  });

  it('has no winner when nobody scored', () => {
    const g = started(['a', 'b']);
    for (let t = 0; t < 100_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBeNull();
  });

  it('ends at the time limit with the most points winning', () => {
    const g = started(['a', 'b']);
    fire(g, 'a', [...shipCells(g)][0]);
    expect(g.snapshot().roundLeftMs).toBeLessThan(90_000);
    for (let t = 0; t < 100_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBe('a');
  });

  it('plays the next round with a new board and scores back at zero', () => {
    const g = started(['a', 'b']);
    fire(g, 'a', [...shipCells(g)][0]);
    for (let t = 0; t < 100_000 && g.snapshot().phase !== 'countdown'; t += STEP) g.tick(STEP);
    expect(g.snapshot().run).toBe(2);
    expect(g.snapshot().cells.every((c) => c === SQUARE_UNKNOWN)).toBe(true);
    expect(me(g, 'a').meters).toBe(0);
    expect(me(g, 'a').wins).toBe(1);
  });
});

describe('a bot at Battleships', () => {
  const snapshotWith = (cells: number[]) => {
    const g = started(['me', 'bot:1']);
    return { ...g.snapshot(), cells };
  };

  it('does nothing when the round is not on, or it is not in it', () => {
    const brain = battleshipsBrain('bot:1', seeded(0.5));
    const g = new BattleshipsGame(seeded(0.3));
    g.join('me');
    g.join('bot:1');
    expect(brain(g.snapshot(), 10_000)).toEqual({});
    const live = started(['me', 'bot:1']);
    expect(battleshipsBrain('stranger', seeded(0.5))(live.snapshot(), 10_000)).toEqual({});
  });

  it('waits between shots', () => {
    const brain = battleshipsBrain('bot:1', seeded(0.5));
    const snap = started(['me', 'bot:1']).snapshot();
    expect(brain(snap, 100)).toEqual({});
    expect(brain(snap, 3000).taps).toHaveLength(1);
    expect(brain(snap, 100)).toEqual({});
  });

  it('goes after the squares beside a hit', () => {
    const cells = new Array(CELLS).fill(SQUARE_UNKNOWN);
    const hit = 3 * SIZE + 3;
    cells[hit] = SQUARE_HIT;
    const next = [hit - 1, hit + 1, hit - SIZE, hit + SIZE];
    let beside = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const brain = battleshipsBrain('bot:1', mulberry32(seed));
      const taps = brain(snapshotWith(cells), 10_000).taps ?? [];
      if (taps.length === 1 && next.includes(taps[0])) beside++;
    }
    expect(beside).toBeGreaterThan(40);
  });

  it('never shoots a square that has been shot, and finds the last one left', () => {
    const cells = new Array(CELLS).fill(SQUARE_MISS);
    cells[17] = SQUARE_UNKNOWN;
    for (let seed = 1; seed <= 20; seed++) {
      expect(battleshipsBrain('bot:1', mulberry32(seed))(snapshotWith(cells), 10_000).taps).toEqual([17]);
    }
    const none = new Array(CELLS).fill(SQUARE_MISS);
    expect(battleshipsBrain('bot:1', seeded(0.5))(snapshotWith(none), 10_000)).toEqual({});
  });

  it('ignores a sunk ship, and looks for the next', () => {
    const cells = new Array(CELLS).fill(SQUARE_UNKNOWN);
    for (const c of [10, 11, 12]) cells[c] = SQUARE_SUNK;
    for (let seed = 1; seed <= 30; seed++) {
      const taps = battleshipsBrain('bot:1', mulberry32(seed))(snapshotWith(cells), 10_000).taps ?? [];
      expect(taps).toHaveLength(1);
      expect([10, 11, 12]).not.toContain(taps[0]);
    }
  });
});

describe('Battleships in a lobby with one person', () => {
  it('adds a bot to make two, which plays a round', () => {
    const g = withBots(new BattleshipsGame(seeded(0.3)), mulberry32(7));
    expect(g).toBeInstanceOf(BotFiller);
    g.join('me');
    const ids = g.snapshot().players.map((p) => p.id);
    expect(ids).toEqual(['me', 'bot:1']);
    for (let t = 0; t < 100_000 && g.snapshot().phase !== 'over' && g.snapshot().run < 2; t += STEP) g.tick(STEP);
    const snap = g.snapshot();
    const bot = (snap.players as { id: string; shots: number }[]).find((p) => p.id === 'bot:1');
    expect(bot?.shots).toBeGreaterThan(10);
    // The person did nothing, so the bot (the only one scoring) wins, if it scored.
    expect(snap.history[0] ?? snap.history[snap.history.length - 1]).toBeDefined();
  });

  it('sizes the fleet for two, with the bot counted', () => {
    const g = withBots(new BattleshipsGame(seeded(0.3)), mulberry32(7));
    g.join('me');
    run(g, 3200);
    expect((g.snapshot() as { fleet: { len: number }[] }).fleet.map((s) => s.len)).toEqual(fleetFor(2));
  });
});
