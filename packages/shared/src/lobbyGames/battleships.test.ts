import { describe, expect, it } from 'vitest';
import { BATTLESHIPS_SIZE, SQUARE_HIT, SQUARE_MISS, SQUARE_SUNK, SQUARE_UNKNOWN, type BattleshipsSnapshot } from '../spinLobby.js';
import { BattleshipsGame, battleshipsBrain, fleetFor, fleetSquares, placeFleets } from './battleships.js';
import { BotFiller, withBots } from './bots.js';
import { mulberry32 } from './roundGame.js';

const SIZE = BATTLESHIPS_SIZE;
const CELLS = SIZE * SIZE;
const STEP = 33;
const seeded = (seed: number) => () => seed;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: BattleshipsGame, id: string) => g.snapshot(id).players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new BattleshipsGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Where each player's hidden ships are, which nobody else can see (a test peeks). */
interface PeekPlayer {
  ships: { cells: number[]; hits: number }[];
}
const players = (g: BattleshipsGame) => (g as unknown as { players: Map<string, PeekPlayer> }).players;
const shipSquares = (g: BattleshipsGame, id: string) => players(g).get(id)!.ships.flatMap((s) => s.cells);
const allShips = (g: BattleshipsGame) => [...players(g).keys()].flatMap((id) => shipSquares(g, id));
const water = (g: BattleshipsGame) => Array.from({ length: CELLS }, (_, i) => i).filter((i) => !allShips(g).includes(i));

/** A shot, then long enough to be ready for the next. */
function fire(g: BattleshipsGame, id: string, square: number) {
  g.tap(id, square);
  run(g, 900);
}

describe('fleetSquares', () => {
  it('shares about 30% of the board out between the players, so each has fewer ships as more play', () => {
    for (let n = 1; n < 12; n++) expect(fleetSquares(n + 1), `${n} to ${n + 1} players`).toBeLessThanOrEqual(fleetSquares(n));
    expect(fleetSquares(1)).toBeGreaterThan(fleetSquares(12) * 5);
    expect(fleetSquares(2)).toBeGreaterThanOrEqual(8);
    expect(fleetSquares(12)).toBe(2);
  });

  it('keeps the free space free: all the ships together never cover more than 40% of the board', () => {
    for (let n = 1; n <= 12; n++) expect((n * fleetSquares(n)) / CELLS, `${n} players`).toBeLessThanOrEqual(0.4);
    // And about 30% for the sizes where it divides evenly enough.
    expect((2 * fleetSquares(2)) / CELLS).toBeGreaterThan(0.27);
    expect((4 * fleetSquares(4)) / CELLS).toBeLessThan(0.34);
  });

  it('is at least two squares each, and the same for one player or none', () => {
    for (let n = 0; n <= 40; n++) expect(fleetSquares(n)).toBeGreaterThanOrEqual(2);
    expect(fleetSquares(0)).toBe(fleetSquares(1));
  });
});

describe('fleetFor', () => {
  it('only has ships 1 to 4 squares long, longest first, that add up to each player\'s squares', () => {
    for (let n = 0; n <= 14; n++) {
      for (let seed = 1; seed <= 30; seed++) {
        const fleet = fleetFor(n, mulberry32(seed));
        expect(fleet.reduce((a, b) => a + b, 0), `${n} players, seed ${seed}`).toBe(fleetSquares(n));
        for (const len of fleet) {
          expect(len).toBeGreaterThanOrEqual(1);
          expect(len).toBeLessThanOrEqual(4);
        }
        expect([...fleet].sort((a, b) => b - a)).toEqual(fleet);
      }
    }
  });

  it('picks different ships for the same number of squares: one 4 and a 1, or 2, 2 and 1', () => {
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) shapes.add(fleetFor(2, mulberry32(seed)).join(","));
    expect(shapes.size).toBeGreaterThan(12);
    const lengths = new Set([...shapes].flatMap((s) => s.split(',').map(Number)));
    expect([...lengths].sort()).toEqual([1, 2, 3, 4]);
  });

  it('is the same from the same seed, and different from another', () => {
    expect(fleetFor(3, mulberry32(11))).toEqual(fleetFor(3, mulberry32(11)));
    const all = new Set(Array.from({ length: 30 }, (_, i) => fleetFor(3, mulberry32(i + 1)).join(',')));
    expect(all.size).toBeGreaterThan(1);
  });
});

describe('placeFleets', () => {
  /** Everyone's fleets for this many players. */
  const fleets = (n: number, seed: number) => Array.from({ length: n }, (_, i) => fleetFor(n, mulberry32(seed * 131 + i)));

  // One test for each player count, and plain checks that collect what is wrong (an `expect` for every cell took seconds, and the
  // whole loop in one test timed out when the machine was busy).
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))('puts every ship on the one board in a straight line, with no two overlapping, whoever they belong to (%i players)', (n) => {
    const problems: string[] = [];
    // The crowded boards are the slow ones to place, so fewer seeds there.
    for (let seed = 1; seed <= (n >= 10 ? 8 : 30); seed++) {
      const want = fleets(n, seed);
      const placed = placeFleets(mulberry32(seed * 7919 + n), want);
      const where = `${n} players, seed ${seed}`;
      if (JSON.stringify(placed.map((p) => p.map((s) => s.length))) !== JSON.stringify(want)) problems.push(`${where}: wrong ships`);
      const all = placed.flat(2);
      if (new Set(all).size !== all.length) problems.push(`${where}: overlap`);
      for (const cells of placed.flat()) {
        if (cells.some((c) => c < 0 || c >= CELLS)) problems.push(`${where}: off the board`);
        const xs = cells.map((c) => c % SIZE);
        const ys = cells.map((c) => Math.floor(c / SIZE));
        if (new Set(xs).size !== 1 && new Set(ys).size !== 1) problems.push(`${where}: not straight`);
        const sorted = [...cells].sort((a, b) => a - b);
        const step = new Set(ys).size === 1 ? 1 : SIZE;
        if (sorted.some((c, k) => k > 0 && c - sorted[k - 1] !== step)) problems.push(`${where}: gap in a ship`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps different players' ships from touching, corners included, when there is room (up to six players)", () => {
    for (let n = 1; n <= 6; n++) {
      for (let seed = 1; seed <= 30; seed++) {
        const ships = placeFleets(mulberry32(seed * 31 + n), fleets(n, seed)).flatMap((own, owner) => own.map((cells) => ({ owner, cells })));
        ships.forEach(({ owner, cells: a }, i) =>
          ships.slice(i + 1).forEach(({ owner: other, cells: b }) => {
            if (owner === other) return;
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
    const want = fleets(3, 1);
    expect(placeFleets(mulberry32(5), want)).toEqual(placeFleets(mulberry32(5), want));
    expect(placeFleets(mulberry32(5), want)).not.toEqual(placeFleets(mulberry32(6), want));
  });
});

describe('BattleshipsGame fleets', () => {
  it('wants two players, and puts everyone\'s ships on the one board, each with their share', () => {
    expect(new BattleshipsGame().minPlayers).toBe(2);
    const two = started(['a', 'b']);
    for (const id of ['a', 'b']) expect(shipSquares(two, id)).toHaveLength(fleetSquares(2));
    expect(new Set(allShips(two)).size).toBe(2 * fleetSquares(2));
    const twelve = started(Array.from({ length: 12 }, (_, i) => `p${i}`));
    for (const id of ['p0', 'p11']) expect(shipSquares(twelve, id)).toHaveLength(fleetSquares(12));
    expect(new Set(allShips(twelve)).size).toBe(12 * fleetSquares(12));
    // Fewer ships each as more play, and free space left: well under half the board is ship.
    expect(shipSquares(twelve, 'p0').length).toBeLessThan(shipSquares(two, 'a').length);
    expect(allShips(twelve).length / CELLS).toBeLessThan(0.4);
    expect(allShips(two).length / CELLS).toBeLessThan(0.4);
  });

  it('hides a different fleet each round', () => {
    const fleets = new Set<string>();
    for (let seed = 0.05; seed < 1; seed += 0.1) fleets.add(shipSquares(started(['a', 'b'], seed), 'a').join(','));
    expect(fleets.size).toBeGreaterThan(3);
  });

  it('shows a player their own ships, and nobody else theirs', () => {
    const g = started(['a', 'b']);
    const snapA = g.snapshot('a');
    const snapB = g.snapshot('b');
    expect(snapA.mine?.flat().sort((x, y) => x - y)).toEqual([...shipSquares(g, 'a')].sort((x, y) => x - y));
    expect(snapB.mine?.flat().sort((x, y) => x - y)).toEqual([...shipSquares(g, 'b')].sort((x, y) => x - y));
    // A spectator sees no ships at all.
    expect(g.snapshot().mine).toBeNull();
    expect(g.snapshot('stranger').mine).toBeNull();
    // Everything else in a's snapshot is the same as in b's, and says nothing about where b's ships are.
    const strip = (s: BattleshipsSnapshot) => ({ ...s, mine: null });
    expect(strip(snapA)).toEqual(strip(snapB));
    expect(snapA.cells.every((c) => c === SQUARE_UNKNOWN)).toBe(true);
    expect(snapA.owner.every((o) => o === -1)).toBe(true);
    expect(JSON.stringify(strip(snapA))).not.toContain('"mine":[');
  });

  it('shows everyone how many squares of each fleet are afloat, and the ships by length', () => {
    const g = started(['a', 'b']);
    const snap = g.snapshot('a');
    expect(snap.players.map((p) => p.afloat)).toEqual([fleetSquares(2), fleetSquares(2)]);
    expect(snap.players[1].fleet.reduce((n, s) => n + s.len, 0)).toBe(fleetSquares(2));
    expect(snap.players[1].fleet.every((s) => !s.sunk)).toBe(true);
  });
});

describe('BattleshipsGame shooting', () => {
  it('scores a hit on someone else\'s ship, and shows it on the board without saying whose it is', () => {
    const g = started(['a', 'b']);
    const hit = shipSquares(g, 'b').find((c) => players(g).get('b')!.ships.find((s) => s.cells.includes(c))!.cells.length > 1) ?? shipSquares(g, 'b')[0];
    g.tap('a', hit);
    const snap = g.snapshot('a');
    // A single-square ship is sunk by its one hit; otherwise it is a hit on a ship still afloat.
    expect([SQUARE_HIT, SQUARE_SUNK]).toContain(snap.cells[hit]);
    expect(snap.by[hit]).toBe(0);
    expect(me(g, 'a')).toMatchObject({ shots: 1, hits: 1 });
    expect(me(g, 'a').meters).toBeGreaterThanOrEqual(1);
    if (snap.cells[hit] === SQUARE_HIT) expect(snap.owner[hit]).toBe(-1);
    expect(snap.players[1].afloat).toBe(fleetSquares(2) - 1);
    // b sees it on their own ship.
    expect(g.snapshot('b').cells[hit]).toBe(snap.cells[hit]);
  });

  it('shows a miss as a miss, and counts the shot', () => {
    const g = started(['a', 'b']);
    const miss = water(g)[0];
    g.tap('a', miss);
    expect(g.snapshot('a').cells[miss]).toBe(SQUARE_MISS);
    expect(g.snapshot('b').cells[miss]).toBe(SQUARE_MISS);
    expect(me(g, 'a')).toMatchObject({ meters: 0, shots: 1, hits: 0 });
  });

  it('gives a bonus to the shot that sinks a ship, and shows the whole ship sunk and whose it was', () => {
    const g = started(['a', 'b']);
    const ships = players(g).get('b')!.ships;
    const ship = ships[ships.length - 1].cells; // the shortest
    for (const c of ship) fire(g, 'a', c);
    const snap = g.snapshot('a');
    expect(me(g, 'a').meters).toBe(ship.length + 1);
    for (const c of ship) {
      expect(snap.cells[c]).toBe(SQUARE_SUNK);
      expect(snap.owner[c]).toBe(1);
    }
    expect(snap.players[1].fleet.filter((s) => s.sunk)).toHaveLength(1);
    expect(snap.players[1].afloat).toBe(fleetSquares(2) - ship.length);
  });

  it('never lets a player shoot at their own ships, and does not charge them for trying', () => {
    const g = started(['a', 'b']);
    const own = shipSquares(g, 'a')[0];
    g.tap('a', own);
    expect(g.snapshot('a').cells[own]).toBe(SQUARE_UNKNOWN);
    expect(me(g, 'a').shots).toBe(0);
    g.tap('a', water(g)[0]);
    expect(me(g, 'a').shots).toBe(1);
  });

  it('lets one person shoot only once in a moment', () => {
    const g = started(['a', 'b']);
    const [first, second] = water(g);
    g.tap('a', first);
    g.tap('a', second);
    expect(g.snapshot('a').cells[second]).toBe(SQUARE_UNKNOWN);
    expect(me(g, 'a').cooldownMs).toBeGreaterThan(500);
    run(g, 900);
    g.tap('a', second);
    expect(g.snapshot('a').cells[second]).toBe(SQUARE_MISS);
    // Someone else is not held up by it.
    g.tap('b', water(g)[2]);
    expect(me(g, 'b').shots).toBe(1);
  });

  it('ignores a shot at a square already shot, without using up the wait, and the first shot at a square counts', () => {
    const g = started(['a', 'b', 'c']);
    const square = water(g)[0];
    g.tap('a', square);
    g.tap('b', square);
    expect(me(g, 'b').shots).toBe(0);
    expect(g.snapshot('b').by[square]).toBe(0);
    g.tap('b', water(g)[1]);
    expect(me(g, 'b').shots).toBe(1);
  });

  it('ignores taps that are not on the board, from nobody, from someone watching, or before the run', () => {
    const g = new BattleshipsGame(seeded(0.3));
    g.join('a');
    g.join('b');
    g.tap('a', 0); // countdown
    run(g, 3200);
    expect(me(g, 'a').shots).toBe(0);
    for (const bad of [-1, CELLS, 1.5, Number.NaN, Infinity]) g.tap('a', bad);
    g.tap('nobody', 0);
    expect(me(g, 'a').shots).toBe(0);
    g.join('late'); // arrives during the run: watches
    g.tap('late', water(g)[0]);
    expect(me(g, 'late').shots).toBe(0);
    expect(g.snapshot('late').mine).toBeNull();
    expect(g.snapshot('late').players.find((p) => p.id === 'late')?.inRound).toBe(false);
  });

  it('never gives away a ship that has not been shot at', () => {
    const g = started(['a', 'b']);
    g.tap('a', shipSquares(g, 'b')[0]);
    const cells = g.snapshot('a').cells;
    expect(cells.filter((c) => c !== SQUARE_UNKNOWN)).toHaveLength(1);
  });
});

describe('BattleshipsGame rounds', () => {
  it('knocks a player out when their whole fleet is sunk, and the last fleet afloat wins', () => {
    const g = started(['a', 'b']);
    for (const c of shipSquares(g, 'b')) fire(g, 'a', c);
    const snap = g.snapshot('a');
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(snap.players.find((p) => p.id === 'b')?.alive).toBe(false);
    expect(me(g, 'a').wins).toBe(1);
    expect(snap.history[0]).toMatchObject({ winnerId: 'a', id: 'a', game: 'battleships' });
    expect(snap.history[0].meters).toBe(me(g, 'a').meters);
  });

  it('carries on with the rest when one is knocked out, and they can no longer shoot', () => {
    const g = started(['a', 'b', 'c']);
    for (const c of shipSquares(g, 'b')) fire(g, 'a', c);
    expect(g.snapshot('a').phase).toBe('playing');
    expect(g.snapshot('a').players.find((p) => p.id === 'b')?.alive).toBe(false);
    g.tap('b', water(g)[0]);
    expect(me(g, 'b').shots).toBe(0);
    for (const c of shipSquares(g, 'c')) fire(g, 'a', c);
    expect(g.snapshot('a').phase).toBe('over');
    expect(g.snapshot('a').winnerId).toBe('a');
  });

  it('shows someone who is out where their ships were, now all sunk', () => {
    const g = started(['a', 'b', 'c']);
    for (const c of shipSquares(g, 'b')) fire(g, 'a', c);
    const snap = g.snapshot('b');
    expect(snap.mine?.flat().sort((x, y) => x - y)).toEqual([...shipSquares(g, 'b')].sort((x, y) => x - y));
    expect(snap.players.find((p) => p.id === 'b')?.fleet.every((s) => s.sunk)).toBe(true);
  });

  it('ends at a lobby\'s time limit with the most squares afloat winning', () => {
    const g = started(['a', 'b']);
    g.timeLimitS = 120;
    fire(g, 'a', shipSquares(g, 'b')[0]); // b has one square fewer afloat than a
    for (let t = 0; t < 130_000 && g.snapshot('a').phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot('a').phase).toBe('over');
    expect(g.snapshot('a').winnerId).toBe('a');
  });

  it('goes on until a fleet is sunk when nothing caps it, and has no winner when a cap runs out with the same afloat', () => {
    const open = started(['a', 'b']);
    run(open, 130_000);
    expect(open.snapshot('a').phase).toBe('playing');
    const g = started(['a', 'b']);
    g.timeLimitS = 120;
    for (let t = 0; t < 130_000 && g.snapshot('a').phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot('a').phase).toBe('over');
    expect(g.snapshot('a').winnerId).toBeNull();
    expect(me(g, 'a').wins + me(g, 'b').wins).toBe(0);
  });

  it('plays the next round with new ships and scores back at zero', () => {
    // A new seed each round, as the real game has (a fixed one would make every round the same).
    let k = 0;
    const g = new BattleshipsGame(() => (k += 0.137) % 1);
    g.join('a');
    g.join('b');
    run(g, 3200);
    const before = shipSquares(g, 'a').join(',');
    for (const c of shipSquares(g, 'b')) fire(g, 'a', c);
    for (let t = 0; t < 20_000 && g.snapshot('a').phase !== 'countdown'; t += STEP) g.tick(STEP);
    run(g, 3200);
    expect(g.snapshot('a').run).toBe(2);
    expect(shipSquares(g, 'a').join(',')).not.toBe(before);
    expect(g.snapshot('a').cells.every((c) => c === SQUARE_UNKNOWN)).toBe(true);
    expect(me(g, 'a').meters).toBe(0);
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'b').alive).toBe(true);
  });
});

describe('a bot at Battleships', () => {
  /** A bot's view of a round with the board as given. */
  const viewWith = (cells: number[], mine?: number[][]) => {
    const g = started(['me', 'bot:1']);
    const snap = g.snapshot('bot:1');
    return { ...snap, cells, mine: mine ?? snap.mine };
  };

  it('does nothing when the round is not on, or it is not in it', () => {
    const brain = battleshipsBrain('bot:1', seeded(0.5));
    const g = new BattleshipsGame(seeded(0.3));
    g.join('me');
    g.join('bot:1');
    expect(brain(g.snapshot('bot:1'), 10_000)).toEqual({});
    const live = started(['me', 'bot:1']);
    expect(battleshipsBrain('stranger', seeded(0.5))(live.snapshot('stranger'), 10_000)).toEqual({});
  });

  it('waits between shots', () => {
    const brain = battleshipsBrain('bot:1', seeded(0.9));
    const snap = started(['me', 'bot:1']).snapshot('bot:1');
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
      const taps = battleshipsBrain('bot:1', mulberry32(seed))(viewWith(cells, []), 10_000).taps ?? [];
      if (taps.length === 1 && next.includes(taps[0])) beside++;
    }
    expect(beside).toBeGreaterThan(40);
  });

  it('never shoots a square that has been shot, or one of its own ships, and finds the last one left', () => {
    const cells = new Array(CELLS).fill(SQUARE_MISS);
    cells[17] = SQUARE_UNKNOWN;
    cells[18] = SQUARE_UNKNOWN; // its own ship is here
    for (let seed = 1; seed <= 40; seed++) {
      const taps = battleshipsBrain('bot:1', mulberry32(seed))(viewWith(cells, [[18]]), 10_000).taps ?? [];
      expect(taps).toEqual([17]);
    }
    const none = new Array(CELLS).fill(SQUARE_MISS);
    expect(battleshipsBrain('bot:1', seeded(0.5))(viewWith(none, []), 10_000)).toEqual({});
  });

  it('ignores a sunk ship, and looks for the next', () => {
    const cells = new Array(CELLS).fill(SQUARE_UNKNOWN);
    for (const c of [10, 11, 12]) cells[c] = SQUARE_SUNK;
    for (let seed = 1; seed <= 30; seed++) {
      const taps = battleshipsBrain('bot:1', mulberry32(seed))(viewWith(cells, []), 10_000).taps ?? [];
      expect(taps).toHaveLength(1);
      expect([10, 11, 12]).not.toContain(taps[0]);
    }
  });
});

describe('Battleships in a lobby with one person', () => {
  /** What the person sees (the lobby's game is the generic type, so say which game it is). */
  const view = (g: { snapshot(viewer?: string): unknown }) => g.snapshot('me') as BattleshipsSnapshot;

  it('adds a bot to make two, which hides its ships on the same board, and shoots', () => {
    const g = withBots(new BattleshipsGame(seeded(0.3)), mulberry32(7));
    expect(g).toBeInstanceOf(BotFiller);
    g.join('me');
    expect(view(g).players.map((p) => p.id)).toEqual(['me', 'bot:1']);
    run(g, 3200);
    expect(view(g).mine?.flat()).toHaveLength(fleetSquares(2));
    run(g, 20_000);
    expect(view(g).players.find((p) => p.id === 'bot:1')?.shots).toBeGreaterThan(5);
    expect(view(g).cells.some((c) => c !== SQUARE_UNKNOWN)).toBe(true);
  });

  it('plays a round to its end, with the bot sinking a person who does nothing', () => {
    const g = withBots(new BattleshipsGame(seeded(0.3)), mulberry32(7));
    g.join('me');
    for (let t = 0; t < 200_000 && view(g).history.length === 0; t += STEP) g.tick(STEP);
    expect(view(g).history).toHaveLength(1);
    // Someone who never fired cannot have won.
    expect(view(g).history[0].winnerId === 'me').toBe(false);
  });
});
