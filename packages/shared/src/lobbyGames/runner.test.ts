import { describe, expect, it } from 'vitest';
import { RUNNER_X } from '../spinLobby.js';
import { RunnerGame } from './runner.js';

const STEP = 66;
const run = (g: RunnerGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: RunnerGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

/** Starts a run (past the countdown) with fixed seeds, so the course is the same every time. */
function started(ids: string[], seed = 0.3) {
  const g = new RunnerGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200);
  return g;
}

const HALF = { cactus: 0.05, bird: 0.03, log: 0.225, stack: 0.05, pit: 0 } as const;
const RUNNER_HALF = 0.02;

/** The first obstacle whose far edge the runner has not yet cleared. */
function nextObstacle(g: RunnerGame) {
  return g
    .snapshot()
    .obstacles.filter((o) => o.x + o.w / 2 + RUNNER_HALF > RUNNER_X)
    .sort((x, y) => x.x - y.x)[0];
}

/** One tick of a player who reads the course: taps over cacti, holds the jump across logs, and ducks
 * under birds. Returns what the player did, for tests that want to change it. */
function botStep(g: RunnerGame, id: string, logMode: 'hold' | 'tap' = 'hold') {
  const speed = g.snapshot().speed;
  const next = nextObstacle(g);
  const ahead = next ? next.x - RUNNER_X : Infinity;
  let hold = false;
  let duck = false;
  // A skinny pair is one obstacle for the bot: it aims its hop at the middle of the pair.
  const pairShift = next?.w === 0.05 ? 0.055 : 0;
  if ((next?.kind === 'cactus' || next?.kind === 'pit') && ahead + pairShift < speed * 0.37) g.action(id, 'jump');
  // A tall stack takes a held jump, started a little before it arrives.
  if (next?.kind === 'stack' && ahead - HALF.stack - RUNNER_HALF < speed * 0.22) hold = true;
  // A held jump needs about 0.12s to get above a log, so it starts a little before the log arrives.
  const logSoon = next?.kind === 'log' && ahead - HALF.log - RUNNER_HALF < speed * 0.22;
  if (logSoon && logMode === 'hold') hold = true;
  if (logSoon && logMode === 'tap') g.action(id, 'jump');
  if (next?.kind === 'bird' && ahead < speed * 0.5 && ahead > -next.w / 2 - 0.01) duck = true;
  g.input(id, 0, duck ? 1 : hold ? -1 : 0);
  g.tick(STEP);
  return { next, ahead, hold, duck };
}

/** A player who reads the course. */
function playBot(g: RunnerGame, id: string, ms: number) {
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) botStep(g, id);
}

describe('RunnerGame rounds', () => {
  it('starts a countdown for a lone runner, then a run', () => {
    const g = new RunnerGame(seeded(0.3));
    expect(g.snapshot().phase).toBe('lobby');
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    expect(me(g, 'a').alive).toBe(true);
  });

  it('makes the same course for the same seed, and a different one for another', () => {
    const course = (seed: number) => {
      const g = started(['a'], seed);
      const kinds: string[] = [];
      for (let i = 0; i < 400; i++) {
        g.tick(STEP);
        for (const o of g.snapshot().obstacles) if (o.x > 1.2) kinds.push(o.kind);
      }
      return kinds.join(',');
    };
    expect(course(0.3)).toBe(course(0.3));
  });

  it('keeps speeding up for as long as a run goes on, past where it used to stop', () => {
    const g = started(['a']);
    const start = g.snapshot().speed;
    playBot(g, 'a', 20_000);
    expect(g.snapshot().speed).toBeGreaterThan(start);
    expect(g.snapshot().speed).toBeGreaterThan(1.05);
  });

  it('knocks a runner out when they hit a cactus and ends a solo run with no winner', () => {
    const g = started(['a']);
    run(g, 3500); // never jumps
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBeNull();
    expect(me(g, 'a').alive).toBe(false);
    expect(me(g, 'a').meters).toBeGreaterThan(0);
    expect(me(g, 'a').wins).toBe(0);
  });

  it('starts another run after the result has been shown', () => {
    const g = started(['a']);
    run(g, 3500);
    expect(g.snapshot().phase).toBe('over');
    run(g, 4200);
    expect(g.snapshot().phase).toBe('countdown');
    expect(me(g, 'a').alive).toBe(true);
    expect(g.snapshot().meters).toBe(0);
  });
});

describe('RunnerGame obstacles', () => {
  it('lets a runner who jumps the cacti and ducks the birds run a long way', () => {
    // Several different courses: every one can be cleared.
    for (const seed of [0.1, 0.3, 0.55, 0.8, 0.95]) {
      const g = started(['a'], seed);
      playBot(g, 'a', 30_000); // there is no top speed, so a bot that reads the course only so far ahead gets caught out in the end
      expect(me(g, 'a').alive, `seed ${seed}`).toBe(true);
      expect(g.snapshot().meters).toBeGreaterThan(150);
    }
  });

  it('knocks out a runner who jumps into a bird', () => {
    const g = started(['a']);
    let died = false;
    for (let t = 0; t < 40_000 && !died; t += STEP) {
      const snap = g.snapshot();
      const next = snap.obstacles.filter((o) => o.x > RUNNER_X - 0.07).sort((a, b) => a.x - b.x)[0];
      const ahead = next ? next.x - RUNNER_X : Infinity;
      // Clears cacti, but jumps at birds as well (never ducks).
      if (next && ahead < snap.speed * 0.37) g.action('a', 'jump');
      g.tick(STEP);
      died = !me(g, 'a').alive;
    }
    expect(died).toBe(true);
  });

  it('only jumps from the ground, and only while a run is on', () => {
    const waiting = new RunnerGame(seeded(0.3));
    waiting.join('a'); // countdown
    waiting.action('a', 'jump');
    expect(me(waiting, 'a').h).toBe(0);

    const g = started(['a']);
    g.action('a', 'jump');
    g.tick(STEP);
    const up = me(g, 'a').h;
    expect(up).toBeGreaterThan(0);
    g.action('a', 'jump'); // already in the air: no double jump
    run(g, 800);
    expect(me(g, 'a').h).toBe(0); // landed
  });

  it('ducks on the ground only', () => {
    const g = started(['a']);
    g.input('a', 0, 1);
    g.tick(STEP);
    expect(me(g, 'a').ducking).toBe(true);
    g.input('a', 0, 0);
    g.tick(STEP);
    expect(me(g, 'a').ducking).toBe(false);
  });
});

describe('RunnerGame with several runners', () => {
  it('crowns the last runner standing and counts a win', () => {
    const g = started(['a', 'b']);
    // a reads the course; b never moves and hits the first cactus.
    playBot(g, "a", 8000);
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'b').alive).toBe(false);
  });

  it('lets someone who joins mid-run watch, and run from the next one', () => {
    const g = started(['a', 'b']);
    g.join('c');
    expect(me(g, 'c').alive).toBe(false);
    playBot(g, "a", 8000);
    run(g, 4200);
    expect(g.snapshot().phase).toBe('countdown');
    expect(me(g, 'c').alive).toBe(true);
  });

  it('ends the run if the other runner leaves, and resets when everyone has left', () => {
    const g = started(['a', 'b']);
    g.leave('b');
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBe('a');
    g.leave('a');
    expect(g.snapshot().phase).toBe('lobby');
    g.join('d');
    expect(g.snapshot().phase).toBe('countdown');
  });
});

describe('RunnerGame run summary and obstacle ids', () => {
  it('counts runs, keeps the last results and the best run', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    expect(g.snapshot().run).toBe(1);
    expect(g.snapshot().history).toEqual([]);
    expect(g.snapshot().best).toBeNull();

    run(g, 3200); // countdown over
    run(g, 3500); // never jumps: a solo run ends
    const first = g.snapshot();
    expect(first.phase).toBe('over');
    expect(first.history).toHaveLength(1);
    expect(first.history[0]).toMatchObject({ id: 'a', winnerId: null });
    expect(first.history[0].meters).toBeGreaterThan(0);
    expect(first.best).toEqual(first.history[0]);

    run(g, 4200); // result shown, next run counts down
    expect(g.snapshot().run).toBe(2);
  });

  it('records who won and keeps only the last 10 runs', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    g.join('b');
    for (let i = 0; i < 12; i++) {
      run(g, 3200);
      playBot(g, 'a', 8000); // b stands still and is knocked out
      run(g, 4200);
    }
    const snap = g.snapshot();
    expect(snap.history).toHaveLength(10);
    expect(snap.history.every((r) => r.winnerId === 'a' && r.id === 'a')).toBe(true);
    expect(snap.run).toBeGreaterThan(10);
  });

  it('numbers obstacles so they keep their number as they scroll', () => {
    const g = started(['a'], 0.4);
    const first = g.snapshot().obstacles[0];
    expect(first.n).toBe(1);
    run(g, 500);
    const same = g.snapshot().obstacles.find((o) => o.n === 1);
    expect(same).toBeDefined();
    expect(same!.x).toBeLessThan(first.x);
    expect(new Set(g.snapshot().obstacles.map((o) => o.n)).size).toBe(g.snapshot().obstacles.length);
  });
});

describe('RunnerGame hold to jump higher', () => {
  /** Jumps `id` (tap or hold), then records how high it goes and for how many ticks it stays off the ground. */
  function flight(how: 'tap' | 'hold' | 'hold-then-release') {
    const g = started(['a']);
    if (how === 'tap') g.action('a', 'jump');
    else g.input('a', 0, -1);
    let peak = 0;
    let airborne = 0;
    for (let i = 0; i < 40; i++) {
      g.tick(STEP);
      if (how === 'hold-then-release' && i === 1) g.input('a', 0, 0);
      peak = Math.max(peak, me(g, 'a').h);
      if (me(g, 'a').h > 0) airborne++;
    }
    return { peak, airborne };
  }

  it('goes higher and stays up longer when the button is held than for a tap', () => {
    const tap = flight('tap');
    const hold = flight('hold');
    expect(tap.peak).toBeGreaterThan(0.5);
    expect(hold.peak).toBeGreaterThan(tap.peak * 1.5);
    expect(hold.airborne).toBeGreaterThan(tap.airborne * 1.4);
  });

  it('is cut short by letting go early', () => {
    const tap = flight('tap');
    const early = flight('hold-then-release');
    const hold = flight('hold');
    expect(early.peak).toBeLessThan(hold.peak);
    expect(early.peak).toBeGreaterThanOrEqual(tap.peak);
  });

  it('does not bounce again while the button stays held after landing', () => {
    const g = started(['a']);
    run(g, 200); // the first cactus is about to arrive: the jump clears it, and lands before the next one
    g.input('a', 0, -1);
    run(g, 1300); // up, down and landed, still holding
    expect(me(g, 'a').h).toBe(0);
    g.input('a', 0, -1); // still held: no new jump
    g.tick(STEP);
    expect(me(g, 'a').h).toBe(0);
    g.input('a', 0, 0);
    g.input('a', 0, -1); // let go and press again: a new jump
    g.tick(STEP);
    expect(me(g, 'a').h).toBeGreaterThan(0);
  });

  it('gives no extra height for pressing the button part-way up a tap jump', () => {
    const g = started(['a']);
    g.action('a', 'jump');
    g.tick(STEP);
    g.input('a', 0, -1); // pressed in mid-air
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      g.tick(STEP);
      peak = Math.max(peak, me(g, 'a').h);
    }
    expect(peak).toBeLessThan(flightPeakOfTap());
  });

  function flightPeakOfTap() {
    const g = started(['a']);
    g.action('a', 'jump');
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      g.tick(STEP);
      peak = Math.max(peak, me(g, 'a').h);
    }
    return peak + 0.01;
  }
});

describe('RunnerGame logs', () => {
  it('only shows logs and birds after a while into a run', () => {
    const seen = { log: 0, bird: 0 };
    for (const seed of [0.1, 0.3, 0.55, 0.8]) {
      const g = started(['a'], seed);
      for (let t = 0; t < 4500 && me(g, 'a').alive; t += STEP) {
        botStep(g, 'a');
        for (const o of g.snapshot().obstacles) if (o.kind === 'log' || o.kind === 'bird') seen[o.kind]++;
      }
    }
    expect(seen).toEqual({ log: 0, bird: 0 });
  });

  it('makes logs wide enough that a tap jump cannot clear them, but a held one can', () => {
    let tested = 0;
    for (const seed of [0.1, 0.3, 0.55, 0.8, 0.95]) {
      // The same course twice: a runner who holds for logs, and one who only taps.
      const play = (logMode: 'hold' | 'tap') => {
        const g = started(['a'], seed);
        let sawLog = false;
        let logSpeed = 0;
        for (let t = 0; t < 60_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
          const { next } = botStep(g, 'a', logMode);
          if (next?.kind === 'log' && !sawLog) logSpeed = g.snapshot().speed;
          if (next?.kind === 'log') sawLog = true;
          if (sawLog && next?.kind !== 'log') break; // the first log has been dealt with
        }
        return { sawLog, logSpeed, alive: me(g, 'a').alive };
      };
      const held = play('hold');
      const tapped = play('tap');
      // At full speed a tap's short hop does carry over a log, so only a log met before that counts.
      if (!held.sawLog || !tapped.sawLog || tapped.logSpeed > 1) continue;
      tested++;
      expect(held.alive, `seed ${seed}: held`).toBe(true);
      expect(tapped.alive, `seed ${seed}: tapped`).toBe(false);
    }
    expect(tested).toBeGreaterThan(2);
  });
});

describe('RunnerGame wide birds and paired cacti', () => {
  /** Every distinct obstacle seen over a bot's run on these seeds, with the width it came with. */
  function seen(seeds: number[]) {
    const all: { kind: string; w: number; n: number; seed: number }[] = [];
    for (const seed of seeds) {
      const g = started(['a'], seed);
      const known = new Set<number>();
      for (let t = 0; t < 60_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
        botStep(g, 'a');
        for (const o of g.snapshot().obstacles) {
          if (o.x > 1.1 && !known.has(o.n)) {
            known.add(o.n);
            all.push({ kind: o.kind, w: o.w, n: o.n, seed });
          }
        }
      }
    }
    return all;
  }
  const SEEDS = [0.1, 0.2, 0.3, 0.45, 0.55, 0.7, 0.8, 0.95];

  it('sends birds that are wide as well as narrow ones, and gives every obstacle its width', () => {
    const birds = seen(SEEDS).filter((o) => o.kind === 'bird');
    expect(birds.some((b) => b.w === 0.06)).toBe(true);
    expect(birds.some((b) => b.w >= 0.18 && b.w <= 0.32)).toBe(true);
    expect(birds.every((b) => b.w === 0.06 || (b.w >= 0.18 && b.w <= 0.32))).toBe(true);
  });

  it('puts two skinny cacti side by side, always in twos', () => {
    const all = seen(SEEDS);
    const skinny = all.filter((o) => o.kind === 'cactus' && o.w === 0.05);
    expect(skinny.length).toBeGreaterThan(1);
    expect(skinny.length % 2).toBe(0);
    // Each skinny cactus has a partner in the next or previous slot.
    for (const o of skinny) {
      const partner = all.find((p) => p.seed === o.seed && p.kind === 'cactus' && p.w === 0.05 && Math.abs(p.n - o.n) === 1);
      expect(partner, `seed ${o.seed} obstacle ${o.n}`).toBeDefined();
    }
    // A normal cactus is still 0.1 wide.
    expect(all.some((o) => o.kind === 'cactus' && o.w === 0.1)).toBe(true);
  });

  it('places a pair with a gap between them, so it reads as a double block', () => {
    // The pair's two cacti are 0.05 wide with 0.06 between them: 0.16 in all.
    const g = started(['a'], 0.3);
    for (let t = 0; t < 40_000 && me(g, 'a').alive; t += STEP) {
      botStep(g, 'a');
      const obs = g.snapshot().obstacles;
      const first = obs.find((o) => o.kind === 'cactus' && o.w === 0.05);
      const second = first && obs.find((o) => o.n === first.n + 1 && o.w === 0.05);
      if (first && second) {
        expect(second.x - first.x).toBeCloseTo(0.11, 2);
        return;
      }
    }
    throw new Error('no pair came up');
  });
});

describe('RunnerGame pits and tall stacks', () => {
  const SEEDS = [0.1, 0.2, 0.3, 0.45, 0.55, 0.7, 0.8, 0.95];

  it('brings pits from about 10 seconds and stacks from about 14, and no sooner', () => {
    const firstAt: Record<string, number> = {};
    for (const seed of SEEDS) {
      const g = started(['a'], seed);
      for (let t = 0; t < 60_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
        botStep(g, 'a');
        for (const o of g.snapshot().obstacles) {
          if ((o.kind === 'pit' || o.kind === 'stack') && o.x > 1.1) firstAt[o.kind] = Math.min(firstAt[o.kind] ?? Infinity, t);
        }
      }
    }
    expect(firstAt.pit).toBeGreaterThan(9000);
    expect(firstAt.stack).toBeGreaterThan(13_000);
    expect(Object.keys(firstAt).sort()).toEqual(['pit', 'stack']);
  });

  it('gives every pit a width a tap hop spans', () => {
    for (const seed of SEEDS) {
      const g = started(['a'], seed);
      for (let t = 0; t < 40_000 && me(g, 'a').alive; t += STEP) {
        botStep(g, 'a');
        for (const o of g.snapshot().obstacles) {
          if (o.kind === 'pit') {
            expect(o.w).toBeGreaterThanOrEqual(0.18);
            expect(o.w).toBeLessThanOrEqual(0.32);
          }
        }
      }
    }
  });

  it('drops a runner who stays on the ground into a pit, and a bot who reads the course gets past pits and stacks', () => {
    let fell = 0;
    let crossed = 0;
    for (const seed of SEEDS) {
      // Jumps only for cacti, ducks birds and holds for logs, so the first pit or stack takes it.
      const g = started(['a'], seed);
      for (let t = 0; t < 60_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) {
        const next = nextObstacle(g);
        const sp = g.snapshot().speed;
        if (next?.kind === 'cactus' && next.x - RUNNER_X + (next.w === 0.05 ? 0.055 : 0) < sp * 0.37) g.action('a', 'jump');
        if (next?.kind === 'log' && next.x - RUNNER_X - 0.245 < sp * 0.22) g.input('a', 0, -1);
        else if (next?.kind === 'bird' && next.x - RUNNER_X < sp * 0.5) g.input('a', 0, 1);
        else g.input('a', 0, 0);
        g.tick(STEP);
        if (!me(g, 'a').alive && next?.kind === 'pit') fell++;
      }
      const h = started(['a'], seed);
      const known = new Set<number>();
      for (let t = 0; t < 60_000 && me(h, 'a').alive && h.snapshot().phase === 'playing'; t += STEP) {
        botStep(h, 'a');
        for (const o of h.snapshot().obstacles) if ((o.kind === 'pit' || o.kind === 'stack') && o.x < RUNNER_X - o.w) known.add(o.n);
      }
      if (known.size > 0) crossed++;
    }
    expect(fell).toBeGreaterThan(0);
    expect(crossed).toBeGreaterThan(2);
  });
});
