import { describe, expect, it } from 'vitest';
import { RACE_CAR_HEIGHT, RACE_CAR_WIDTH, RACE_FRONT_Y, RACE_KERB, RACE_PIT_WIDTH } from '../spinLobby.js';
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

/** A driver who reads the track: looks at what is coming toward their row in the next second or so, and
 * steers for the reachable spot with the most room, preferring the nearest. */
function playBot(g: RaceGame, id: string, ms: number) {
  let last = '';
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    const snap = g.snapshot();
    const { x, y } = me(g, id);
    const reach = (o: { h: number }) => (o.h + RACE_CAR_HEIGHT) / 2;
    // Obstacles that will reach the driver's row within the next second and a bit.
    const threats = snap.obstacles.filter((o) => o.y < y + reach(o) && y - o.y < snap.speed * 1.2 + reach(o));
    const clearance = (cx: number) => threats.reduce((m, o) => Math.min(m, Math.abs(o.x - cx) - (o.w + RACE_CAR_WIDTH) / 2), 1);
    // Obstacles level with the car: steering through them would be a hit.
    const inRow = snap.obstacles.filter((o) => Math.abs(o.y - y) < reach(o) + 0.04);
    const blocked = (from: number, to: number) => inRow.some((o) => {
      const half = (o.w + RACE_CAR_WIDTH) / 2;
      return Math.max(from, to) > o.x - half && Math.min(from, to) < o.x + half;
    });
    let best = x;
    let bestScore = -Infinity;
    for (let cx = 0.08; cx <= 0.92; cx += 0.02) {
      if (blocked(x, cx)) continue;
      const score = Math.min(clearance(cx), 0.1) * 10 - Math.abs(cx - x) * 1.2;
      if (score > bestScore) {
        bestScore = score;
        best = cx;
      }
    }
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

  it('speeds the track up as the run goes on, to a limit', () => {
    const g = started(['a']);
    const start = g.snapshot().speed;
    playBot(g, 'a', 30_000);
    expect(g.snapshot().speed).toBeGreaterThan(start);
    expect(g.snapshot().speed).toBeLessThanOrEqual(0.95);
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
    for (const seed of [0.1, 0.3, 0.55, 0.8, 0.95]) {
      const g = started(['a'], seed);
      const last = playBot(g, 'a', 60_000);
      expect(me(g, 'a').alive, `seed ${seed} ${last}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(500);
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

  it('keeps the first stretch of road clear, then puts pit lanes at both sides over a run', () => {
    const g = new RaceGame(lcg(11));
    g.join('a');
    run(g, 3200);
    run(g, 1500);
    expect(g.snapshot().pits).toHaveLength(0);
    const sides = new Set<number>();
    for (let t = 0; t < 60_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
      playBot(g, 'a', STEP);
      for (const s of g.snapshot().pits) sides.add(s.side);
    }
    expect([...sides].sort()).toEqual([-1, 1]);
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
    // Wait for a left pit lane to reach the driver's row, then drive into it.
    let dragged = false;
    for (let t = 0; t < 40_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
      const { pits } = g.snapshot();
      const row = me(g, 'a').y;
      const onRow = pits.find((s) => s.side === -1 && row >= s.y && row <= s.y + s.h);
      g.input('a', onRow ? -1 : 0, 0);
      g.tick(STEP);
      if (onRow && me(g, 'a').x < RACE_KERB + RACE_PIT_WIDTH && me(g, 'a').y > RACE_FRONT_Y + 0.05) {
        dragged = true;
        break;
      }
    }
    expect(dragged).toBe(true);
  });
});
