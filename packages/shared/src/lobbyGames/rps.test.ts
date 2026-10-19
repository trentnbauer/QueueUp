import { describe, expect, it } from 'vitest';
import type { RpsSnapshot } from '../spinLobby.js';
import { BotFiller } from './bots.js';
import { RpsGame, beats, rpsBrain } from './rps.js';

const STEP = 33;
const ROCK = 0;
const PAPER = 1;
const SCISSORS = 2;
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const snap = (g: RpsGame) => g.snapshot() as RpsSnapshot;
const me = (g: RpsGame, id: string, viewer = id) => (g.snapshot(viewer) as RpsSnapshot).players.find((p) => p.id === id)!;

function started(ids: string[], seed = 7) {
  const g = new RpsGame(lcg(seed));
  ids.forEach((id) => g.join(id));
  run(g, 3200); // past the countdown
  return g;
}

/** Ticks until a round is being picked, and returns its number. */
function pickStage(g: RpsGame): number {
  for (let i = 0; i < 400 && !(snap(g).stage === 'pick' && snap(g).round > 0); i++) g.tick(STEP);
  return snap(g).round;
}

/** Everyone given picks, then ticks until the result is showing. */
function play(g: RpsGame, picks: Record<string, number>) {
  const round = pickStage(g);
  for (const [id, pick] of Object.entries(picks)) g.tap(id, pick);
  for (let i = 0; i < 100 && snap(g).stage === 'pick' && snap(g).round === round; i++) g.tick(STEP);
}

describe('beats', () => {
  it('is paper over rock, scissors over paper, rock over scissors', () => {
    expect(beats(PAPER, ROCK)).toBe(true);
    expect(beats(SCISSORS, PAPER)).toBe(true);
    expect(beats(ROCK, SCISSORS)).toBe(true);
    expect(beats(ROCK, PAPER)).toBe(false);
    expect(beats(ROCK, ROCK)).toBe(false);
  });
});

describe('RpsGame rounds', () => {
  it('needs two players', () => {
    expect(new RpsGame().minPlayers).toBe(2);
  });

  it('puts out whoever made the losing choice, and the last one in wins', () => {
    const g = started(['a', 'b']);
    play(g, { a: ROCK, b: SCISSORS });
    expect(me(g, 'a').outcome).toBe('win');
    expect(me(g, 'b').outcome).toBe('lose');
    expect(me(g, 'b').alive).toBe(false);
    expect(me(g, 'a').meters).toBe(1);
    run(g, 100);
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: 'a' });
    expect(snap(g).history.at(-1)?.meters).toBe(1);
  });

  it('is a draw, played again, if everyone made the same choice or all three were made', () => {
    const g = started(['a', 'b', 'c']);
    play(g, { a: ROCK, b: ROCK, c: ROCK });
    expect(snap(g).draw).toBe(true);
    expect(snap(g).players.every((p) => p.alive && p.outcome === 'draw')).toBe(true);
    const first = snap(g).round;
    run(g, 2000);
    play(g, { a: ROCK, b: PAPER, c: SCISSORS });
    expect(snap(g).draw).toBe(true);
    expect(snap(g).players.every((p) => p.alive)).toBe(true);
    expect(snap(g).round).toBeGreaterThan(first);
    expect(snap(g).players.every((p) => p.meters === 0)).toBe(true);
  });

  it('scores every winner, and puts out every loser, when two choices were made among several', () => {
    const g = started(['a', 'b', 'c']);
    play(g, { a: ROCK, b: ROCK, c: SCISSORS });
    expect(snap(g).players.map((p) => [p.id, p.alive, p.meters])).toEqual([['a', true, 1], ['b', true, 1], ['c', false, 0]]);
    expect(snap(g).phase).toBe('playing');
  });

  it('puts out someone who has not picked when the time is up, and counts only their first pick', () => {
    const g = started(['a', 'b']);
    const round = pickStage(g);
    g.tap('a', ROCK);
    g.tap('a', PAPER); // a second tap: ignored
    for (let i = 0; i < 200 && snap(g).round === round && snap(g).stage === 'pick'; i++) g.tick(STEP);
    expect(me(g, 'b').outcome).toBe('late');
    expect(me(g, 'b').alive).toBe(false);
    expect(me(g, 'a').pick).toBe(ROCK);
  });

  it('keeps what others picked hidden while people are still choosing, and shows everything once it is decided', () => {
    const g = started(['a', 'b']);
    pickStage(g);
    g.tap('a', PAPER);
    const forB = snap(g);
    expect(g.snapshot('b')).toMatchObject({ stage: 'pick' });
    expect(me(g, 'a', 'b')).toMatchObject({ picked: true, pick: -1, outcome: null });
    expect(me(g, 'a', 'a').pick).toBe(PAPER);
    // A spectator sees no picks either.
    expect(JSON.stringify(g.snapshot()).includes(`"pick":${PAPER}`)).toBe(false);
    void forB;
    g.tap('b', ROCK);
    g.tick(STEP);
    expect(me(g, 'a', 'b').pick).toBe(PAPER);
    expect(me(g, 'b', 'a').pick).toBe(ROCK);
  });

  it('gives less time to pick every round, down to a floor', () => {
    const g = started(['a', 'b', 'c']);
    const first = (pickStage(g), snap(g).pickTotalMs);
    expect(first).toBe(3500);
    let last = first;
    for (let i = 0; i < 25; i++) {
      play(g, { a: ROCK, b: ROCK, c: ROCK }); // draws, so the run goes on
      run(g, 2000);
      pickStage(g);
      last = snap(g).pickTotalMs;
    }
    expect(last).toBe(1200);
  });

  it('ignores junk and anything outside a pick', () => {
    const g = new RpsGame(lcg(7));
    g.join('a');
    g.join('b'); // countdown
    g.tap('a', ROCK);
    run(g, 3200);
    pickStage(g);
    g.tap('a', 9);
    g.tap('a', -1);
    g.tap('a', 1.5);
    expect(me(g, 'a').picked).toBe(false);
    g.input('a', 1, 0);
    g.action('a', 'whatever');
    expect(me(g, 'a').picked).toBe(false);
  });

  it('puts the last two out together when neither picks, and nobody wins', () => {
    const g = started(['a', 'b']);
    run(g, 6000);
    expect(snap(g)).toMatchObject({ phase: 'over', winnerId: null });
  });
});

describe('RpsGame with a bot', () => {
  const duel = (seed: number) => {
    const rng = lcg(seed);
    const g = new BotFiller(new RpsGame(rng), 2, (id) => rpsBrain(id, lcg(seed * 3 + 1)));
    g.join('me');
    return g;
  };

  it('plays you when you are alone, and a run ends when one of you is out', () => {
    const g = duel(5);
    expect((g.snapshot() as RpsSnapshot).players.map((p) => p.id)).toEqual(['me', 'bot:1']);
    run(g, 3200);
    for (let t = 0; t < 120_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const s = g.snapshot('me') as RpsSnapshot;
      if (s.stage === 'pick' && !s.players.find((p) => p.id === 'me')!.picked) g.tap('me', ROCK);
      g.tick(STEP);
    }
    expect(g.snapshot().phase).not.toBe('playing');
  });

  it('is a game of chance that a bot reading a person who always plays rock wins more often than a coin would', () => {
    let wins = 0;
    const runs = 120;
    for (let seed = 1; seed <= runs; seed++) {
      const g = duel(seed);
      run(g, 3200);
      for (let t = 0; t < 120_000 && g.snapshot().phase === 'playing'; t += STEP) {
        const s = g.snapshot('me') as RpsSnapshot;
        if (s.stage === 'pick' && !s.players.find((p) => p.id === 'me')!.picked) g.tap('me', ROCK);
        g.tick(STEP);
      }
      wins += (g.snapshot('me') as RpsSnapshot).players.find((p) => p.id === 'me')!.meters;
    }
    // A coin: about one round won on average. Always rock into a bot that counters a third of the time: well under that.
    expect(wins / runs).toBeLessThan(0.8);
    expect(wins / runs).toBeGreaterThan(0.1);
  });
});
