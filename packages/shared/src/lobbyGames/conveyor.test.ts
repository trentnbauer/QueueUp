import { describe, expect, it } from 'vitest';
import { CONVEYOR_PLAYER_X } from '../spinLobby.js';
import { ConveyorGame, jumpHeight, pitWidth } from './conveyor.js';

const STEP = 33;
const run = (g: ConveyorGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: ConveyorGame) => g.snapshot();
const me = (g: ConveyorGame, id: string) => snap(g).players.find((p) => p.id === id)!;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

function started(ids: string[], seed = 7) {
  const g = new ConveyorGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Plays until the run is over (or `ms` is up), and says how long it lasted in seconds. */
function untilOver(g: ConveyorGame, ms: number, each: () => void = () => {}): number {
  let t = 0;
  for (; t < ms && snap(g).phase === 'playing'; t += STEP) {
    each();
    g.tick(STEP);
  }
  return t / 1000;
}

/** A runner who jumps each thing so that the top of the jump is where it reaches them, seeing the belt `delay` seconds late. `jumps: false` never jumps. */
function makeJumper(g: ConveyorGame, id: string, { delay = 0, jumps = true }: { delay?: number; jumps?: boolean } = {}) {
  const handled = new Set<number>();
  return () => {
    const s = snap(g);
    const mine = s.players.find((p) => p.id === id)!;
    if (!jumps || s.phase !== 'playing' || !mine.alive || mine.jumping) return;
    // The nearest thing that has not reached the runner yet.
    const next = s.obstacles.filter((o) => o.x < CONVEYOR_PLAYER_X + 0.02 && !handled.has(o.n)).reduce<(typeof s.obstacles)[number] | null>((a, b) => (!a || b.x > a.x ? b : a), null);
    if (!next) return;
    const arrives = (CONVEYOR_PLAYER_X - next.x) / s.speed - delay;
    if (arrives <= 0.3) {
      handled.add(next.n);
      g.action(id, 'jump');
    }
  };
}

describe('jumpHeight', () => {
  it('is an arc: nothing before and after, the highest in the middle', () => {
    expect(jumpHeight(-1)).toBe(0);
    expect(jumpHeight(0)).toBe(0);
    expect(jumpHeight(0.3)).toBeCloseTo(0.25, 5);
    expect(jumpHeight(0.6)).toBe(0);
    expect(jumpHeight(0.1)).toBeLessThan(jumpHeight(0.2));
  });
});

describe('pitWidth', () => {
  it('starts at 0.12 and grows, so in the end a pit is longer than a jump can clear', () => {
    expect(pitWidth(0)).toBeCloseTo(0.12, 5);
    expect(pitWidth(100)).toBeGreaterThan(pitWidth(10));
    // At 120 seconds the belt runs at about 1.5 screens a second, and a jump lasts half a second.
    expect(pitWidth(200) / (0.5 + 0.008 * 200)).toBeGreaterThan(0.6);
  });
});

describe('ConveyorGame', () => {
  it('starts the runner on the belt with a clear stretch before the first thing', () => {
    const g = started(['a']);
    expect(snap(g).phase).toBe('playing');
    expect(me(g, 'a')).toMatchObject({ h: 0, jumping: false, alive: true });
    expect(snap(g).obstacles.every((o) => o.x < CONVEYOR_PLAYER_X - 0.1)).toBe(true);
  });

  it('jumps on a tap, comes back down, and ignores a tap in the air except a last-moment one', () => {
    const g = started(['a']);
    g.action('a', 'jump');
    run(g, 150);
    const up = me(g, 'a');
    expect(up.jumping).toBe(true);
    expect(up.h).toBeGreaterThan(0.1);
    g.action('a', 'jump'); // far too early: ignored
    run(g, 500);
    expect(me(g, 'a').jumping).toBe(false);
    expect(me(g, 'a').h).toBe(0);
    // A tap in the last tenth of a second of a jump starts the next one as soon as it lands.
    g.action('a', 'jump');
    run(g, 520);
    g.action('a', 'jump');
    run(g, 120);
    expect(me(g, 'a').jumping).toBe(true);
    g.action('a', 'dance');
  });

  it('lays the same belt for the same seed, and another for another', () => {
    const belt = (seed: number) => {
      const g = started(['a'], seed);
      run(g, 12_000);
      return JSON.stringify(snap(g).obstacles.map((o) => [o.kind, o.x]));
    };
    expect(belt(5)).toBe(belt(5));
    expect(belt(5)).not.toBe(belt(9));
  });

  it('brings crates, pits and later tall stacks, and the pits get longer', () => {
    const kinds = new Set<string>();
    let firstPit = 0;
    let lastPit = 0;
    const g = started(['a'], 5);
    g.report('a', 1, true, { j: -1 });
    for (let t = 0; t < 90_000 && snap(g).phase === 'playing'; t += STEP) {
      g.report('a', 1, true, { j: -1 }); // keep the runner safe, to watch the belt
      g.tick(STEP);
      for (const o of snap(g).obstacles) {
        kinds.add(o.kind);
        if (o.kind === 'pit') {
          firstPit ||= o.w;
          lastPit = o.w;
        }
      }
    }
    expect([...kinds].sort()).toEqual(['crate', 'pit', 'stack']);
    expect(lastPit).toBeGreaterThan(firstPit * 2);
  });

  it('puts a runner who never jumps out, and ends a solo run with no winner', () => {
    const g = started(['a']);
    const s = untilOver(g, 60_000);
    expect(snap(g).phase).toBe('over');
    expect(s).toBeLessThan(10);
    expect(me(g, 'a').alive).toBe(false);
    expect(snap(g).winnerId).toBeNull();
  });

  it('lets a runner who jumps on time last a good while, and the belt gets too much for everyone in the end', () => {
    const lasted: number[] = [];
    for (const seed of [3, 5, 7, 11]) {
      const g = started(['a'], seed);
      lasted.push(untilOver(g, 900_000, makeJumper(g, 'a')));
    }
    for (const s of lasted) expect(s).toBeLessThan(900);
    expect(Math.min(...lasted)).toBeGreaterThan(30);
    // Someone a third of a second late does worse.
    const late = [3, 5, 7, 11].map((seed) => {
      const g = started(['a'], seed);
      return untilOver(g, 900_000, makeJumper(g, 'a', { delay: 0.33 }));
    });
    expect(Math.max(...late)).toBeLessThan(Math.min(...lasted));
  });

  it('crowns the last one on the belt, with their own metres as the run', () => {
    const g = started(['a', 'b'], 5);
    const keen = makeJumper(g, 'a');
    untilOver(g, 900_000, keen);
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
  });

  it('ends at the lobby time cap, with whoever is still in keeping their metres and nobody winning', () => {
    const g = started(['a', 'b'], 5);
    g.timeLimitS = 30;
    const one = makeJumper(g, 'a');
    const two = makeJumper(g, 'b');
    untilOver(g, 60_000, () => {
      one();
      two();
    });
    const s = snap(g);
    expect(s.phase).toBe('over');
    expect(s.winnerId).toBeNull();
  });

  it('puts a new run back at the start', () => {
    const g = started(['a'], 5);
    untilOver(g, 60_000);
    run(g, 4000 + 3200);
    const s = snap(g);
    expect(s.phase).toBe('playing');
    expect(s.run).toBe(2);
    expect(me(g, 'a')).toMatchObject({ jumping: false, alive: true });
  });
});

describe('ConveyorGame on each player’s own device', () => {
  it('works out its own jump there, and reports it', () => {
    const g = started(['a']);
    const copy = new ConveyorGame(lcg(7));
    copy.join('a');
    copy.startRunAt(123);
    copy.action('a', 'jump');
    for (let t = 0; t < 160; t += 16) copy.stepRun(0.016);
    const report = copy.localReport('a')!;
    expect(report.alive).toBe(true);
    expect(report.f.j).toBeGreaterThan(0);
    expect(Object.keys(report.f).length).toBeLessThanOrEqual(8);
    g.report('a', 1, true, report.f);
    expect(me(g, 'a').jumping).toBe(true);
  });

  it('takes a report of being out, and keeps a malformed report in range', () => {
    const g = started(['a']);
    g.report('a', 1, true, { j: 9e9 });
    expect(me(g, 'a').h).toBeLessThanOrEqual(0.25);
    g.report('a', 1, false, { j: -1 });
    expect(me(g, 'a').alive).toBe(false);
  });
});
