import { describe, expect, it } from 'vitest';
import { RedLightGame, redLightBrain } from './redlight.js';

const STEP = 33;
const run = (g: RedLightGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const me = (g: RedLightGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const seeded = (seed: number) => () => seed;

function started(ids: string[], seed = 0.3) {
  const g = new RedLightGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Holds the run button only while the light is plain green: safe, and as fast as can be done safely. */
function playSafe(g: RedLightGame, id: string, ms: number) {
  for (let t = 0; t < ms && me(g, id).alive && g.snapshot().phase === 'playing'; t += STEP) {
    g.input(id, g.snapshot().light === 'green' ? 1 : 0, 0);
    g.tick(STEP);
  }
}

describe('RedLightGame', () => {
  it('needs two players', () => {
    expect(new RedLightGame().minPlayers).toBe(2);
  });

  it('starts a run on green, and runs while the button is held', () => {
    const g = started(['a', 'b']);
    expect(g.snapshot().phase).toBe('playing');
    expect(g.snapshot().light).toBe('green');
    g.input('a', 1, 0);
    run(g, 1000);
    expect(me(g, 'a').x).toBeGreaterThan(0.05);
    expect(me(g, 'b').x).toBe(0);
  });

  it('knocks out someone who is still running well after the light turns red', () => {
    const g = started(['a', 'b']);
    g.input('a', 1, 0);
    for (let t = 0; t < 20_000 && me(g, 'a').alive && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(me(g, 'a').alive).toBe(false);
  });

  it('lets someone who stops in time live, and gives them the win when the other is caught', () => {
    const g = started(['a', 'b']);
    g.input('b', 1, 0); // never lets go
    for (let t = 0; t < 40_000 && g.snapshot().phase === 'playing'; t += STEP) {
      g.input('a', g.snapshot().light === 'green' ? 1 : 0, 0);
      g.tick(STEP);
    }
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'b').alive).toBe(false);
  });

  it('gives the win to the first across the line', () => {
    const g = started(['a', 'b']);
    // Both play safe, but `a` has a head start.
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const green = g.snapshot().light === 'green';
      g.input('a', green ? 1 : 0, 0);
      if (t > 1500) g.input('b', green ? 1 : 0, 0);
      g.tick(STEP);
    }
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').x).toBe(1);
    expect(me(g, 'a').wins).toBe(1);
  });

  it('can always be won: a safe player crosses the line in under a minute on several seeds', () => {
    for (const seed of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      const g = started(['a', 'b'], seed);
      g.input('b', 0, 0);
      playSafe(g, 'a', 60_000);
      expect(me(g, 'a').x, `seed ${seed}`).toBe(1);
      expect(g.snapshot().winnerId, `seed ${seed}`).toBe('a');
    }
  });

  it('ends a run nobody finishes after 45 seconds, with the furthest ahead winning', () => {
    const g = started(['a', 'b']);
    g.input('a', 1, 0);
    // `a` runs only on the first green, then stands still.
    run(g, 800);
    g.input('a', 0, 0);
    run(g, 50_000);
    expect(g.snapshot().phase === 'over' || g.snapshot().run > 1).toBe(true);
    expect(g.snapshot().history[0]?.winnerId).toBe('a');
  });

  it('is a draw when the leaders are tied at the time limit', () => {
    const g = started(['a', 'b']);
    run(g, 50_000);
    expect(g.snapshot().history[0]?.winnerId).toBeNull();
  });

  it('makes the lights the same for the same seed', () => {
    const lights = (seed: number) => {
      const g = started(['a', 'b'], seed);
      const out: string[] = [];
      for (let t = 0; t < 20_000; t += STEP) {
        g.tick(STEP);
        out.push(g.snapshot().light);
      }
      return out.join();
    };
    expect(lights(0.4)).toBe(lights(0.4));
    expect(lights(0.4)).not.toBe(lights(0.9));
  });

  it('flashes amber before red', () => {
    const g = started(['a', 'b']);
    const seen: string[] = [];
    for (let t = 0; t < 20_000; t += STEP) {
      g.tick(STEP);
      const light = g.snapshot().light;
      if (seen[seen.length - 1] !== light) seen.push(light);
    }
    expect(seen.slice(0, 4)).toEqual(['green', 'warn', 'red', 'green']);
  });
});

describe('redLightBrain', () => {
  it('races to the line against a player who stands still, but is sometimes caught', () => {
    let caught = 0;
    let finished = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = started(['me', 'bot:1'], seed / 41);
      const r = (() => {
        let a = seed;
        return () => ((a = (a * 16807) % 2147483647) / 2147483647);
      })();
      const brain = redLightBrain('bot:1', r);
      let held = '';
      for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) {
        const cmd = brain(g.snapshot(), STEP);
        const key = String(cmd.dx ?? 0);
        if (key !== held) g.input('bot:1', cmd.dx ?? 0, 0);
        held = key;
        g.tick(STEP);
      }
      if (!me(g, 'bot:1').alive) caught++;
      if (me(g, 'bot:1').x >= 1) finished++;
    }
    // A bot plays to win, but makes the odd mistake.
    expect(finished).toBeGreaterThan(5);
    expect(caught).toBeGreaterThan(0);
  });

  it('does nothing when it is out or the run is not on', () => {
    const g = new RedLightGame(seeded(0.3));
    g.join('me');
    g.join('bot:1');
    const brain = redLightBrain('bot:1', () => 0.5);
    expect(brain(g.snapshot(), STEP)).toEqual({ dx: 0 });
  });
});
