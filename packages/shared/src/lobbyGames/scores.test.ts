import { describe, expect, it } from 'vitest';
import type { LobbyRunScore } from '../spinLobby.js';
import { rankScores } from '../miniGames.js';
import { RunnerGame } from './runner.js';

const STEP = 33;

describe('run scores', () => {
  it('reports a real player\'s score once when a run ends, and nothing for a bot or a spectator', () => {
    const g = new RunnerGame(() => 0.5);
    const heard: LobbyRunScore[][] = [];
    g.onRunScores = (s) => heard.push(s);
    g.join('alice');
    g.join('bot:1');
    for (let t = 0; t < 3200; t += STEP) g.tick(STEP);
    for (let t = 0; t < 120_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(heard).toHaveLength(1);
    expect(heard[0].map((s) => s.userId)).toEqual(['alice']);
    expect(heard[0][0].score).toBeGreaterThan(0);
  });

  it('says nothing when nobody scored', () => {
    const g = new RunnerGame(() => 0.5);
    let calls = 0;
    g.onRunScores = () => calls++;
    g.join('alice');
    for (let t = 0; t < 1000; t += STEP) g.tick(STEP);
    expect(calls).toBe(0);
  });
});

describe('rankScores', () => {
  it('gives equal scores the same rank', () => {
    expect(rankScores([50, 50, 40, 40, 10])).toEqual([1, 1, 3, 3, 5]);
    expect(rankScores([])).toEqual([]);
  });
});
