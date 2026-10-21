import { describe, expect, it } from 'vitest';
import { RACE_CAR_HEIGHT, RACE_CAR_WIDTH, RACE_FRONT_Y, RACE_KERB } from '../spinLobby.js';
import { RaceGame, raceStartX } from './race.js';

const STEP = 66;
const run = (g: RaceGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: RaceGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

function started(ids: string[], seed = 0.3) {
  const g = new RaceGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** A driver who reads the track: looks at the strip of track just above their row (what reaches them in the next half second or
 * so), works out where nothing is (inflating everything by half a car), and steers for the nearest gap, at its middle if it is
 * narrow. Pit lanes count as things to steer round. */
function playBot(g: RaceGame, id: string, ms: number) {
  let last = '';
  const half = RACE_CAR_WIDTH / 2;
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    const snap = g.snapshot();
    const { x, y } = me(g, id);
    const ahead = snap.speed * 0.6;
    const blocks: [number, number][] = [];
    for (const o of snap.obstacles) if (o.y + o.h / 2 > y - ahead - RACE_CAR_HEIGHT / 2 && o.y - o.h / 2 < y + RACE_CAR_HEIGHT / 2) blocks.push([o.x - o.w / 2 - half, o.x + o.w / 2 + half]);
    for (const s of snap.pits) if (s.y + s.h > y - ahead && s.y < y + RACE_CAR_HEIGHT / 2) blocks.push([s.x0 - half, s.x1 + half]);
    blocks.sort((p, q) => p[0] - q[0]);
    // The gaps between them, across the track between the kerbs.
    const gaps: [number, number][] = [];
    let edge = RACE_KERB + half;
    for (const [lo, hi] of blocks) {
      if (lo > edge) gaps.push([edge, lo]);
      edge = Math.max(edge, hi);
    }
    if (edge < 1 - RACE_KERB - half) gaps.push([edge, 1 - RACE_KERB - half]);
    const distance = (gap: [number, number]) => (x < gap[0] ? gap[0] - x : x > gap[1] ? x - gap[1] : 0);
    const gap = gaps.sort((p, q) => distance(p) - distance(q))[0];
    const best = gap ? (gap[1] - gap[0] < 0.12 ? (gap[0] + gap[1]) / 2 : Math.min(gap[1] - 0.02, Math.max(gap[0] + 0.02, x))) : x;
    g.input(id, Math.abs(best - x) < 0.01 ? 0 : best > x ? 1 : -1, 0);
    last = JSON.stringify({ t, x, y, best, speed: snap.speed });
    g.tick(STEP);
  }
  return last;
}

describe('RaceGame rounds', () => {
  it('counts down for one player, then starts a run at full speed on the front line', () => {
    const g = new RaceGame(seeded(0.3));
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(me(g, 'a').y).toBe(RACE_FRONT_Y);
  });

  it('makes the same track for the same seed', () => {
    const track = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 2500);
      return JSON.stringify(g.snapshot().obstacles);
    };
    expect(track(0.4)).toBe(track(0.4));
    expect(track(0.4)).not.toBe(track(0.9));
  });

  it('keeps speeding the track up for as long as the run goes on', () => {
    const g = started(['a']);
    const start = g.snapshot().speed;
    playBot(g, 'a', 30_000);
    expect(g.snapshot().speed).toBeGreaterThan(start);
    expect(g.snapshot().speed).toBeGreaterThan(1);
  });

  it('ends a solo run with no winner once the driver slides off the bottom', () => {
    const g = started(['a']);
    let lowest = RACE_FRONT_Y;
    // Never steers: the obstacles keep coming down its lane until it goes off.
    for (let t = 0; t < 120_000 && g.snapshot().phase === 'playing'; t += STEP) {
      g.tick(STEP);
      lowest = Math.max(lowest, me(g, 'a').y);
    }
    expect(['over', 'countdown']).toContain(g.snapshot().phase);
    expect(me(g, 'a').wins).toBe(0);
    expect(lowest).toBeGreaterThan(0.8);
  });
});

describe('RaceGame driving', () => {
  it('steers left and right and stays inside the kerbs', () => {
    const g = started(['a']);
    const x0 = me(g, 'a').x;
    g.input('a', 1, 0);
    run(g, 200);
    expect(me(g, 'a').x).toBeGreaterThan(x0);
    g.input('a', -1, 0);
    run(g, 5000);
    expect(me(g, 'a').x).toBeGreaterThanOrEqual(RACE_KERB + RACE_CAR_WIDTH / 2 - 1e-9);
    g.input('a', 99, 0); // junk input is no direction
    const before = me(g, 'a').x;
    run(g, 200);
    expect(me(g, 'a').x).toBe(before);
  });

  it('ignores steering before the run starts', () => {
    const g = new RaceGame(seeded(0.3));
    g.join('a'); // countdown
    g.input('a', 1, 0);
    run(g, 1000);
    expect(me(g, 'a').x).toBeCloseTo(raceStartX('a'), 3);
  });

  it('starts each driver at a spot that comes from their id, the same in every game', () => {
    expect(raceStartX('a')).toBe(raceStartX('a'));
    for (const id of ['a', 'b', 'someone', 'bot:1']) {
      expect(raceStartX(id)).toBeGreaterThanOrEqual(0.3);
      expect(raceStartX(id)).toBeLessThanOrEqual(0.7);
    }
    expect(raceStartX('a')).not.toBe(raceStartX('b'));
  });

  it('knocks a driver down the screen on a hit, then they climb back to the front line and no further', () => {
    const g = started(['a']);
    // Drive straight until the first hit.
    let hitAt = -1;
    for (let t = 0; t < 60_000 && hitAt < 0; t += STEP) {
      g.tick(STEP);
      if (me(g, 'a').y > RACE_FRONT_Y) hitAt = t;
    }
    expect(hitAt).toBeGreaterThan(0);
    expect(me(g, 'a').hit).toBe(true);
    // Get out of the way and let them recover.
    playBot(g, 'a', 8000);
    const p = me(g, 'a');
    expect(p.alive).toBe(true);
    expect(p.y).toBe(RACE_FRONT_Y);
    expect(p.hit).toBe(false);
  });

  it('lets a driver who steers clear last a long time, on several tracks', () => {
    for (const seed of [0.1, 0.55, 0.8, 0.95]) {
      const g = started(['a'], seed);
      const last = playBot(g, 'a', 60_000);
      expect(me(g, 'a').alive, `seed ${seed} ${last}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(500);
    }
    // And on tracks whose obstacles and pit lanes are a real mix (a constant random source puts every pit in the same place).
    for (const seed of [3, 7, 11, 19]) {
      let s = seed;
      const g = new RaceGame(() => (s = (s * 16807) % 2147483647) / 2147483647);
      g.join('a');
      run(g, 3200);
      const last = playBot(g, 'a', 45_000);
      expect(me(g, 'a').alive, `mixed seed ${seed} ${last}`).toBe(true);
    }
  });
});

describe('RaceGame with several players', () => {
  it('crowns the last driver on the screen and counts a win', () => {
    const g = started(['a', 'b']);
    playBot(g, 'a', 120_000); // b never steers
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'b').alive).toBe(false);
  });

  it('lets someone who joins mid-run watch, and race from the next one', () => {
    const g = started(['a', 'b']);
    g.join('c');
    expect(me(g, 'c').alive).toBe(false);
    playBot(g, 'a', 120_000);
    run(g, 4200);
    expect(g.snapshot().phase).toBe('countdown');
    expect(me(g, 'c').alive).toBe(true);
  });
});

describe('RaceGame summary data', () => {
  it('numbers obstacles, gives each a kind, and reports which way each driver steers', () => {
    const g = started(['a']);
    run(g, 4000);
    const obstacles = g.snapshot().obstacles;
    expect(obstacles.length).toBeGreaterThan(0);
    expect(new Set(obstacles.map((o) => o.n)).size).toBe(obstacles.length);
    for (const o of obstacles) expect(['cone', 'oil', 'rock']).toContain(o.kind);
    g.input('a', 1, 0);
    g.tick(STEP);
    expect(me(g, 'a').dir).toBe(1);
  });
});

describe('RaceGame reports from a driver’s own device', () => {
  it('takes where they are, kept on the track and never ahead of the front line', () => {
    const g = new RaceGame(seeded(0.3));
    g.join('a');
    run(g, 3200);
    g.report('a', 1, true, { x: 5, y: -3, vy: Number.NaN, dir: 7, grace: 0 });
    const p = me(g, 'a');
    expect(p.x).toBe(1);
    expect(p.y).toBe(RACE_FRONT_Y);
    expect(p.dir).toBe(0);
  });

  it('knocks them out when they say they are off the bottom', () => {
    const g = new RaceGame(seeded(0.3));
    g.join('a');
    g.join('b');
    run(g, 3200);
    g.report('a', 1, false, { x: 0.5, y: 1.05, vy: 0.2, dir: 0, grace: 0 });
    g.tick(STEP);
    expect(me(g, 'a').alive).toBe(false);
    expect(g.snapshot().winnerId).toBe('b');
  });
});

describe('RaceGame pit lanes', () => {
  /** A varying random source, so the pit lanes are not all the same stretch. */
  const lcg = (seed: number) => {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  };

  it('keeps the first stretch of road clear, then puts pit lanes against either kerb and in the middle, of different widths', () => {
    const g = new RaceGame(lcg(11));
    g.join('a');
    run(g, 3200);
    run(g, 1500);
    expect(g.snapshot().pits).toHaveLength(0);
    const kinds = new Set<string>();
    const widths: number[] = [];
    for (let t = 0; t < 120_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
      playBot(g, 'a', STEP);
      for (const s of g.snapshot().pits) {
        kinds.add(s.x0 <= RACE_KERB + 1e-3 ? 'left' : s.x1 >= 1 - RACE_KERB - 1e-3 ? 'right' : 'middle');
        widths.push(s.x1 - s.x0);
      }
    }
    expect([...kinds].sort()).toEqual(['left', 'middle', 'right']);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(0.0999);
    expect(Math.max(...widths)).toBeGreaterThan(0.22);
    expect(Math.max(...widths)).toBeLessThanOrEqual(0.3201);
  });

  it('always leaves a way through: the safe lane is never over a pit lane, however many there are', () => {
    for (const seed of [3, 11, 19, 29]) {
      const g = new RaceGame(lcg(seed));
      g.join('a');
      run(g, 3200);
      for (let t = 0; t < 90_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
        playBot(g, 'a', STEP);
        const pits = g.snapshot().pits;
        // Wherever pit lanes overlap in the track, at least one gap between them is as wide as the safe lane.
        for (const row of [0.1, 0.3, 0.5]) {
          const here = pits.filter((s) => s.y <= row && row <= s.y + s.h).sort((x, y) => x.x0 - y.x0);
          let edge = RACE_KERB;
          let widest = 0;
          for (const s of here) {
            widest = Math.max(widest, s.x0 - edge);
            edge = Math.max(edge, s.x1);
          }
          widest = Math.max(widest, 1 - RACE_KERB - edge);
          expect(widest, `seed ${seed} row ${row}`).toBeGreaterThanOrEqual(0.18);
        }
      }
    }
  });

  it('shows the same pit lanes for the same seed', () => {
    const lanes = (seed: number) => {
      const g = new RaceGame(lcg(seed));
      g.join('a');
      run(g, 12_000);
      return JSON.stringify(g.snapshot().pits);
    };
    expect(lanes(5)).toBe(lanes(5));
  });

  it('drags a driver down the screen while they are in a pit lane, and not on the road', () => {
    const g = new RaceGame(lcg(11));
    g.join('a');
    run(g, 3200);
    // Wait for a pit lane to reach the driver's row, then drive into it.
    let dragged = false;
    for (let t = 0; t < 40_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
      const { pits } = g.snapshot();
      const row = me(g, 'a').y;
      const onRow = pits.find((s) => row >= s.y && row <= s.y + s.h);
      const x = me(g, 'a').x;
      // Steer toward the middle of the pit lane that has reached the driver's row.
      g.input('a', onRow ? (x < (onRow.x0 + onRow.x1) / 2 ? 1 : -1) : 0, 0);
      g.tick(STEP);
      if (onRow && me(g, 'a').x >= onRow.x0 && me(g, 'a').x <= onRow.x1 && me(g, 'a').y > RACE_FRONT_Y + 0.05) {
        dragged = true;
        break;
      }
    }
    expect(dragged).toBe(true);
  });
});
