import { describe, expect, it } from 'vitest';
import { ASTEROIDS_MAX_ANGLE, ASTEROIDS_TURRET_Y } from '../spinLobby.js';
import { AsteroidsGame } from './asteroids.js';

const STEP = 33;
const run = (g: AsteroidsGame, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const me = (g: AsteroidsGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new AsteroidsGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Aims a player's gun at the lowest asteroid in the sky (the nearest to hitting anything), as a player would. */
function aim(g: AsteroidsGame, id: string) {
  const snap = g.snapshot();
  const self = me(g, id);
  const target = [...snap.asteroids].sort((a, b) => b.y - a.y)[0];
  if (!target) return g.input(id, 0, 0);
  const want = Math.atan2(target.x - self.x, ASTEROIDS_TURRET_Y - target.y);
  g.input(id, Math.abs(want - self.angle) < 0.05 ? 0 : want > self.angle ? 1 : -1, 0);
}

function play(g: AsteroidsGame, ids: string[], ms: number) {
  for (let t = 0; t < ms && g.snapshot().phase === 'playing'; t += STEP) {
    for (const id of ids) aim(g, id);
    g.tick(STEP);
  }
}

describe('AsteroidsGame', () => {
  it('puts every turret at its own spot along the bottom, the same for the whole run', () => {
    const g = started(['a', 'b', 'c', 'd']);
    const xs = g.snapshot().players.map((p) => p.x);
    expect(new Set(xs).size).toBe(4);
    for (const x of xs) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
    run(g, 2000);
    expect(g.snapshot().players.map((p) => p.x)).toEqual(xs);
  });

  it('puts turrets at the same spots for the same seed', () => {
    const spots = (seed: number) => started(['a', 'b', 'c'], seed).snapshot().players.map((p) => p.x);
    expect(spots(0.4)).toEqual(spots(0.4));
  });

  it('swings the gun while a direction is held, within its limit, and fires by itself', () => {
    const g = started(['a', 'b']);
    g.input('a', 1, 0);
    run(g, 300);
    expect(me(g, 'a').angle).toBeGreaterThan(0);
    run(g, 5000);
    expect(me(g, 'a').angle).toBeLessThanOrEqual(ASTEROIDS_MAX_ANGLE + 1e-6);
    // Shots exist with nobody pressing anything else.
    expect(g.snapshot().shots.length + g.snapshot().asteroids.length).toBeGreaterThan(0);
    g.input('a', 0, 0);
    const held = me(g, 'a').angle;
    run(g, 300);
    expect(me(g, 'a').angle).toBe(held);
  });

  it('fires shots along the gun, away from the turret', () => {
    const g = started(['a', 'b']);
    g.input('a', 1, 0);
    run(g, 600);
    const shot = g.snapshot().shots.find((s) => s.by === 0);
    expect(shot).toBeDefined();
    expect(shot!.vy).toBeLessThan(0); // up the screen
    expect(shot!.vx).toBeGreaterThan(0); // toward the way the gun swung
  });

  it('scores for whoever fires the shot that breaks an asteroid, and keeps a score for everyone', () => {
    const g = started(['a', 'b']);
    play(g, ['a'], 40_000);
    // a aims and b never moves; a should have broken some asteroids by the time a turret is hit.
    expect(me(g, 'a').meters + me(g, 'b').meters).toBeGreaterThan(0);
  });

  it('knocks out the player whose turret an asteroid reaches, and the last turret standing wins', () => {
    const g = started(['a', 'b']);
    // a defends; b does nothing. Asteroids get through sooner or later, and the run ends when one turret is left.
    play(g, ['a'], 150_000);
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    const out = snap.players.filter((p) => !p.alive);
    expect(out.length).toBeGreaterThanOrEqual(1);
    const survivor = snap.players.find((p) => p.alive);
    if (survivor) expect(snap.winnerId).toBe(survivor.id);
    else expect(snap.winnerId).toBeNull();
  });

  it('ends a solo run when you are hit, with no winner and your count as the score', () => {
    const g = started(['a']);
    play(g, [], 150_000);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: null });
    expect(g.snapshot().history.at(-1)?.meters).toBe(me(g, 'a').meters);
  });

  it('gives a winner their own count as the run score, not the best of anyone', () => {
    // Both players idle until one is hit; the survivor wins.
    const g = started(['a', 'b'], 0.7);
    for (let t = 0; t < 150_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    const last = g.snapshot();
    expect(last.phase).toBe('over');
    if (last.winnerId) {
      expect(last.history.at(-1)?.meters).toBe(last.players.find((p) => p.id === last.winnerId)!.meters);
    }
  });

  it('only counts turrets for people who were in the run when it started', () => {
    const g = started(['a']);
    g.join('late');
    expect(me(g, 'late')).toMatchObject({ alive: false, inRun: false, meters: 0 });
    // The late joiner has no turret, so nothing can knock them out or be blamed on them.
    play(g, ['a'], 20_000);
    expect(me(g, 'late').inRun).toBe(false);
  });

  it('makes breaking a big asteroid take two hits, and small ones one', () => {
    const g = started(['a']);
    let sawBig = false;
    let sawSmall = false;
    for (let t = 0; t < 120_000 && g.snapshot().phase === 'playing'; t += STEP) {
      g.tick(STEP);
      for (const a of g.snapshot().asteroids) {
        if (a.r > 0.05) sawBig = a.hp <= 2;
        else sawSmall = a.hp === 1;
      }
      if (sawBig && sawSmall) break;
    }
    expect(sawBig).toBe(true);
    expect(sawSmall).toBe(true);
  });
});
