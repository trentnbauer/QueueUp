import { describe, expect, it } from 'vitest';
import { BotFiller } from './bots.js';
import { SumoGame, sumoBrain } from './sumo.js';
import { createLobbyGame } from './index.js';

const STEP = 33;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const seeded = (seed: number) => () => seed;
const me = (g: SumoGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;

function started(ids: string[], seed = 0.3) {
  const g = new SumoGame(seeded(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Walks `id` toward `target` until they are close, facing it. */
function approach(g: SumoGame, id: string, target: string) {
  for (let i = 0; i < 200; i++) {
    const gap = me(g, target).x - me(g, id).x;
    if (Math.abs(gap) < 0.06) break;
    g.input(id, gap > 0 ? 1 : -1, 0);
    g.tick(STEP);
  }
  g.input(id, 0, 0);
}

describe('SumoGame', () => {
  it('needs two players, and starts everyone spread along the platform', () => {
    expect(new SumoGame().minPlayers).toBe(2);
    const g = started(['a', 'b', 'c']);
    const xs = g.snapshot().players.map((p) => p.x);
    expect(new Set(xs).size).toBe(3);
    expect(g.snapshot().platform).toMatchObject({ l: expect.closeTo(0.1, 1), r: expect.closeTo(0.9, 1) });
  });

  it('walks left and right and faces the way it last walked', () => {
    const g = started(['a', 'b']);
    const before = me(g, 'a').x;
    g.input('a', 1, 0);
    run(g, 300);
    expect(me(g, 'a').x).toBeGreaterThan(before);
    expect(me(g, 'a').face).toBe(1);
    g.input('a', -1, 0);
    run(g, 100);
    expect(me(g, 'a').face).toBe(-1);
  });

  it('knocks someone just in front of the shover away from them, then makes the shover wait', () => {
    const g = started(['a', 'b']);
    approach(g, 'a', 'b');
    const bx = me(g, 'b').x;
    const dir = Math.sign(bx - me(g, 'a').x);
    g.action('a', 'shove');
    run(g, 300);
    expect((me(g, 'b').x - bx) * dir).toBeGreaterThan(0.05);
    expect(me(g, 'a').cooldownMs).toBeGreaterThan(0);
    // A second shove straight away is ignored while the first is cooling down.
    const v = me(g, 'b').x;
    g.action('a', 'shove');
    run(g, 100);
    expect(me(g, 'b').x).toBeCloseTo(v, 1);
  });

  it('does not hit someone behind the shover or out of reach', () => {
    const g = started(['a', 'b']);
    const bx = me(g, 'b').x;
    // a faces away from b, or is far from b.
    g.input('a', me(g, 'a').x < bx ? -1 : 1, 0);
    g.tick(STEP);
    g.input('a', 0, 0);
    g.action('a', 'shove');
    run(g, 300);
    expect(me(g, 'b').x).toBeCloseTo(bx, 2);
  });

  it('knocks out whoever is pushed off an end, and the last one on wins', () => {
    const g = started(['a', 'b']);
    // Walk a to b, then keep shoving b toward the nearer end until b falls.
    for (let i = 0; i < 600 && me(g, 'b').alive && g.snapshot().phase === 'playing'; i++) {
      const { l, r } = g.snapshot().platform;
      const b = me(g, 'b');
      const pushRight = r - b.x < b.x - l;
      // a stands on the side that pushes b toward the nearer end, facing b.
      const goal = b.x + (pushRight ? -0.05 : 0.05);
      const dx = goal - me(g, 'a').x;
      g.input('a', Math.abs(dx) < 0.01 ? (pushRight ? 1 : -1) : dx > 0 ? 1 : -1, 0);
      g.action('a', 'shove');
      g.tick(STEP);
    }
    expect(me(g, 'b').alive).toBe(false);
    expect(g.snapshot()).toMatchObject({ phase: 'over', winnerId: 'a' });
    expect(me(g, 'a').wins).toBe(1);
  });

  it('shrinks the platform from both ends, to a minimum, so a run always ends', () => {
    const g = started(['a', 'b']);
    const w0 = g.snapshot().platform.r - g.snapshot().platform.l;
    run(g, 5000);
    const { l, r } = g.snapshot().platform;
    expect(r - l).toBeLessThan(w0);
    expect(l - 0.1).toBeCloseTo(0.9 - r, 3);
    run(g, 60_000);
    const final = g.snapshot().platform;
    expect(final.r - final.l).toBeGreaterThanOrEqual(0.239);
  });

  it('knocks someone off with no shove once the platform has shrunk past them', () => {
    const g = started(['a', 'b']);
    run(g, 90_000);
    // Both stood still near the edges of the start, so the shrinking ends have taken them.
    expect(g.snapshot().phase).not.toBe('playing');
  });

  it('ignores a shove from someone knocked out or only watching', () => {
    const g = started(['a', 'b']);
    g.join('late');
    g.action('late', 'shove');
    g.action('a', 'jump');
    expect(me(g, 'late')).toMatchObject({ alive: false, shoveMs: 0 });
  });

  it('gets a bot when a person is alone, and the bot walks and eventually shoves', () => {
    const g = createLobbyGame('sumo') as BotFiller;
    expect(g).toBeInstanceOf(BotFiller);
    g.join('a');
    run(g, 3300);
    expect(g.snapshot().players.map((p) => p.id)).toEqual(['a', 'bot:1']);
    const start = (g.snapshot().players[1] as { x: number }).x;
    let shoved = false;
    for (let t = 0; t < 20_000 && g.snapshot().phase === 'playing'; t += STEP) {
      g.tick(STEP);
      if ((g.snapshot().players[1] as { shoveMs: number }).shoveMs > 0) shoved = true;
    }
    expect((g.snapshot().players[1] as { x: number }).x).not.toBe(start);
    expect(shoved).toBe(true);
  });

  it('has a brain that backs away from an edge', () => {
    const brain = sumoBrain('bot:1', seeded(0.5));
    const snap = {
      id: 'sumo',
      phase: 'playing',
      platform: { l: 0.3, r: 0.7 },
      players: [
        { id: 'bot:1', x: 0.31, face: -1, alive: true, cooldownMs: 0 },
        { id: 'a', x: 0.6, face: 1, alive: true, cooldownMs: 0 },
      ],
    } as unknown as Parameters<typeof brain>[0];
    expect(brain(snap, STEP).dx).toBe(1);
  });
});
