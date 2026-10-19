import { describe, expect, it } from 'vitest';
import type { PotatoSnapshot } from '../spinLobby.js';
import { BotFiller } from './bots.js';
import { PotatoGame, potatoBrain } from './potato.js';

const STEP = 33;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const snap = (g: PotatoGame) => g.snapshot();
const me = (g: PotatoGame, id: string) => snap(g).players.find((p) => p.id === id)!;

function started(ids: string[], seed = 7) {
  const g = new PotatoGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until somebody holds the bomb. */
function toBomb(g: PotatoGame) {
  for (let i = 0; i < 400 && !snap(g).holderId; i++) g.tick(STEP);
  expect(snap(g).holderId).not.toBeNull();
}

describe('PotatoGame', () => {
  it('needs two players', () => {
    expect(new PotatoGame().minPlayers).toBe(2);
  });

  it('hands the bomb to a player after a moment, and never says how long the fuse is', () => {
    const g = started(['a', 'b', 'c']);
    toBomb(g);
    const s = snap(g);
    expect(['a', 'b', 'c']).toContain(s.holderId);
    expect(s.round).toBe(1);
    expect(JSON.stringify(s)).not.toMatch(/fuse/i);
  });

  it('lets only the holder pass, to the next player along, and not straight away', () => {
    const g = started(['a', 'b', 'c']);
    toBomb(g);
    const holder = snap(g).holderId!;
    const others = ['a', 'b', 'c'].filter((id) => id !== holder);
    g.action(others[0], 'pass'); // not the holder
    expect(snap(g).holderId).toBe(holder);
    g.action(holder, 'pass'); // just received it: still cooling down
    expect(snap(g).holderId).toBe(holder);
    run(g, 500);
    g.action(holder, 'pass');
    const ring = ['a', 'b', 'c'];
    expect(snap(g).holderId).toBe(ring[(ring.indexOf(holder) + 1) % 3]);
    expect(snap(g).fromId).toBe(holder);
    expect(snap(g).passes).toBe(1);
  });

  it('knocks out whoever holds the bomb when it goes off, then starts a new round', () => {
    const g = started(['a', 'b', 'c']);
    toBomb(g);
    const holder = snap(g).holderId!;
    for (let t = 0; t < 14_000 && snap(g).holderId === holder; t += STEP) g.tick(STEP);
    expect(me(g, holder).alive).toBe(false);
    expect(snap(g).phase).toBe('playing');
    toBomb(g);
    expect(snap(g).round).toBe(2);
    expect(snap(g).holderId).not.toBe(holder);
  });

  it('shortens the longest fuse each round, so every run ends', () => {
    // Nobody passes: each bomb goes off in its first holder's hands.
    const g = started(['a', 'b', 'c', 'd']);
    const lengths: number[] = [];
    for (let round = 1; round <= 3 && snap(g).phase === 'playing'; round++) {
      toBomb(g);
      const holder = snap(g).holderId!;
      let t = 0;
      for (; t < 20_000 && snap(g).holderId === holder; t += STEP) g.tick(STEP);
      lengths.push(t);
    }
    expect(lengths.length).toBeGreaterThan(1);
    expect(lengths[0]).toBeLessThanOrEqual(11_100);
  });

  it('gives the run to the last player in, and scores the rounds they got through', () => {
    const g = started(['a', 'b']);
    for (let i = 0; i < 4000 && snap(g).phase === 'playing'; i++) g.tick(STEP);
    expect(snap(g).phase).toBe('over');
    expect(['a', 'b']).toContain(snap(g).winnerId);
    const loser = snap(g).winnerId === 'a' ? 'b' : 'a';
    expect(me(g, loser).alive).toBe(false);
    expect(snap(g).history.at(-1)?.meters).toBeGreaterThanOrEqual(0);
  });

  it('plays against a bot when alone, and the bot passes on its own', () => {
    const g = new BotFiller(new PotatoGame(lcg(5)), 2, (id) => potatoBrain(id, lcg(9)));
    g.join('me');
    expect(g.snapshot().players.map((p) => p.id)).toEqual(['me', 'bot:1']);
    run(g, 3200);
    let botHeld = false;
    let passedOn = false;
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing' && !passedOn; t += STEP) {
      const s = g.snapshot() as PotatoSnapshot;
      if (s.holderId === 'me' && s.passCooldownMs === 0) g.action('me', 'pass');
      g.tick(STEP);
      if (s.holderId === 'bot:1') botHeld = true;
      else if (botHeld && s.holderId === 'me') passedOn = true;
    }
    expect(passedOn).toBe(true);
  });

  it('scores the time you held a bomb and then passed on, and nothing for a hold that ended in an explosion', () => {
    const g = started(['a', 'b']);
    const scores: { userId: string; score: number }[][] = [];
    g.onRunScores = (s) => scores.push(s);
    toBomb(g);
    const first = snap(g).holderId!;
    const other = first === 'a' ? 'b' : 'a';
    run(g, 2000); // held for two seconds (the fuse is longer than that on round 1)
    g.action(first, 'pass');
    expect(snap(g).holderId).toBe(other);
    // Nobody passes again: the bomb goes off in the other player's hands, and the run ends.
    for (let i = 0; i < 4000 && snap(g).phase === 'playing'; i++) g.tick(STEP);
    expect(snap(g).phase).toBe('over');
    const byUser = Object.fromEntries(scores[0].map((s) => [s.userId, s.score]));
    // The first holder held it for about two seconds: about 20 tenths of a second.
    expect(byUser[first]).toBeGreaterThanOrEqual(18);
    expect(byUser[first]).toBeLessThanOrEqual(30);
    // The other held it until it blew up on them, which counts for nothing (so they have no score at all).
    expect(byUser[other]).toBeUndefined();
  });
});
