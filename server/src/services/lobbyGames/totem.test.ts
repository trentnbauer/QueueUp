import { describe, expect, it } from 'vitest';
import { TOTEM_CENTER } from '@queueup/shared';
import { TotemGame } from './totem.js';

const STEP = 66;
function run(game: TotemGame, ms: number) {
  for (let t = 0; t < ms; t += STEP) game.tick(STEP);
}
const me = (g: TotemGame, id: string) => g.snapshot().players.find((p) => p.id === id)!;
const dist = (g: TotemGame, a: string, b: string) => Math.hypot(me(g, a).x - me(g, b).x, me(g, a).y - me(g, b).y);

function startedRound(ids = ['a', 'b']) {
  const g = new TotemGame();
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

describe('TotemGame phases', () => {
  it('is free-roam practice for one player, and starts a countdown when a second joins', () => {
    const g = new TotemGame();
    g.join('a');
    expect(g.snapshot().phase).toBe('lobby');
    run(g, 5000);
    expect(g.snapshot().phase).toBe('lobby');
    g.join('b');
    expect(g.snapshot().phase).toBe('countdown');
    expect(g.snapshot().players.every((p) => p.alive)).toBe(true);
  });

  it('starts the round when the countdown ends', () => {
    const g = new TotemGame();
    g.join('a');
    g.join('b');
    run(g, 2000);
    expect(g.snapshot().phase).toBe('countdown');
    run(g, 1400);
    expect(g.snapshot().phase).toBe('playing');
  });

  it('shrinks the totem during a round, down to a minimum', () => {
    const g = startedRound();
    const start = g.snapshot().radius;
    run(g, 10_000);
    const mid = g.snapshot().radius;
    expect(mid).toBeLessThan(start);
    run(g, 60_000);
    // Players start across the ring from each other, so a shrinking totem puts someone off long
    // before the minimum: the radius only matters while the round is on.
    expect(g.snapshot().radius).toBeGreaterThanOrEqual(0.13);
  });
});

describe('TotemGame punching and falling', () => {
  it('shoves a player in reach away from the puncher', () => {
    const g = startedRound();
    // Walk a toward b until they are within punching reach.
    const b = me(g, 'b');
    const a = me(g, 'a');
    g.input('a', Math.sign(b.x - a.x), Math.sign(b.y - a.y));
    for (let i = 0; i < 60 && dist(g, 'a', 'b') > 0.1; i++) g.tick(STEP);
    g.input('a', 0, 0);
    expect(dist(g, 'a', 'b')).toBeLessThanOrEqual(0.13);
    const before = dist(g, 'a', 'b');
    g.action('a', 'punch');
    g.tick(STEP);
    g.tick(STEP);
    expect(dist(g, 'a', 'b')).toBeGreaterThan(before);
  });

  it('does not shove a player out of reach', () => {
    const g = startedRound();
    const before = { ...me(g, 'b') };
    g.action('a', 'punch'); // they start across the ring from each other
    g.tick(STEP);
    expect(me(g, 'b').x).toBe(before.x);
    expect(me(g, 'b').y).toBe(before.y);
  });

  it('ends the round with the last player standing and counts a win', () => {
    const g = startedRound();
    g.input('b', 1, 0); // b walks off the totem
    run(g, 3000);
    const snap = g.snapshot();
    expect(snap.phase).toBe('over');
    expect(snap.winnerId).toBe('a');
    expect(me(g, 'a').wins).toBe(1);
    expect(me(g, 'b').alive).toBe(false);
  });

  it('starts another round after the winner has been shown, keeping wins', () => {
    const g = startedRound();
    g.input('b', 1, 0);
    run(g, 3000);
    expect(g.snapshot().phase).toBe('over');
    run(g, 2500);
    expect(g.snapshot().phase).toBe('countdown');
    expect(g.snapshot().players.every((p) => p.alive)).toBe(true);
    expect(me(g, 'a').wins).toBe(1);
  });

  it('limits punching with a cooldown and ignores punches before a round or unknown moves', () => {
    const g = startedRound();
    g.action('a', 'punch');
    expect(me(g, 'a').cooldown).toBeGreaterThan(0);
    const swing = me(g, 'a').punchAgo;
    g.tick(100);
    g.action('a', 'punch'); // still cooling down: not a new punch
    expect(me(g, 'a').punchAgo).toBeGreaterThan(swing);
    g.action('a', 'dance');

    const waiting = new TotemGame();
    waiting.join('a');
    waiting.join('b'); // countdown
    waiting.action('a', 'punch');
    expect(me(waiting, 'a').cooldown).toBe(0);
  });

  it('lets a player who joins mid-round watch, and play from the next round', () => {
    const g = startedRound();
    g.join('c');
    expect(me(g, 'c').alive).toBe(false);
    g.input('b', 1, 0);
    run(g, 3000); // the round ends
    run(g, 2500); // the next countdown begins
    expect(me(g, 'c').alive).toBe(true);
  });

  it('ends the round if the other player leaves', () => {
    const g = startedRound();
    g.leave('b');
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().winnerId).toBe('a');
  });

  it('keeps a lone player on the totem', () => {
    const g = new TotemGame();
    g.join('a');
    g.input('a', 1, 0);
    run(g, 20_000);
    const p = me(g, 'a');
    expect(Math.hypot(p.x - TOTEM_CENTER, p.y - TOTEM_CENTER)).toBeLessThanOrEqual(0.4 + 1e-6);
    expect(p.alive).toBe(true);
  });
});
