import { describe, expect, it, vi } from 'vitest';
import { BotFiller, botColor, botNumber, isBotId, withBots } from './bots.js';
import { createLobbyGame } from './index.js';
import { RedLightGame, redLightBrain } from './redlight.js';
import { DodgeGame } from './dodge.js';

const STEP = 33;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};
const ids = (g: { snapshot(): { players: { id: string }[] } }) => g.snapshot().players.map((p) => p.id);
const seeded = (seed: number) => () => seed;

function filler(seed = 0.3) {
  return new BotFiller(new RedLightGame(seeded(seed)), 2, (id) => redLightBrain(id, seeded(0.5)));
}

describe('bot ids', () => {
  it('tells bots from members and numbers them', () => {
    expect(isBotId('bot:1')).toBe(true);
    expect(isBotId('0b6f6f4a-1d1c-4f6e-9a39-0123456789ab')).toBe(false);
    expect(botNumber('bot:3')).toBe(3);
    expect(botColor('bot:1')).toMatch(/^#/);
    expect(botColor('bot:1')).not.toBe(botColor('bot:2'));
  });
});

describe('withBots', () => {
  it('leaves games that need one player alone', () => {
    const g = new DodgeGame();
    expect(withBots(g)).toBe(g);
  });

  it('wraps games that need more, and createLobbyGame does it for you', () => {
    const g = createLobbyGame('redlight');
    g.join('me');
    expect(ids(g)).toEqual(['me', 'bot:1']);
    expect(createLobbyGame('dodge')).toBeInstanceOf(DodgeGame);
  });
});

describe('BotFiller', () => {
  it('adds one bot for a lone player, up to the minimum and no further', () => {
    const g = filler();
    g.join('a');
    expect(ids(g)).toEqual(['a', 'bot:1']);
    expect(g.botCount).toBe(1);
    run(g, 5000);
    expect(g.botCount).toBe(1);
  });

  it('adds no bots when enough people are in', () => {
    const g = filler();
    g.join('a');
    g.join('b');
    expect(ids(g)).toEqual(['a', 'b']);
    expect(g.botCount).toBe(0);
  });

  it('sends the bot away when a real player arrives between runs', () => {
    const g = filler();
    g.join('a');
    expect(g.snapshot().phase).toBe('countdown');
    g.join('b');
    expect(ids(g)).toEqual(['a', 'b']);
  });

  it('never adds or removes a bot during a run', () => {
    const g = filler();
    g.join('a');
    run(g, 3200);
    expect(g.snapshot().phase).toBe('playing');
    g.join('b');
    run(g, 500);
    expect(ids(g)).toContain('bot:1');
    // Once the run is over, the bot makes way.
    for (let t = 0; t < 90_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    g.tick(STEP);
    expect(ids(g)).toEqual(['a', 'b']);
  });

  it('removes the bots, and resets the game, when the last person leaves', () => {
    const g = filler();
    g.join('a');
    run(g, 3200);
    g.leave('a');
    expect(ids(g)).toEqual([]);
    expect(g.snapshot().phase).toBe('lobby');
    expect(g.botCount).toBe(0);
  });

  it('plays the bot: it runs, and a run with a person who never moves has a winner', () => {
    const g = filler();
    g.join('a');
    run(g, 3200);
    const bot = () => g.snapshot().players.find((p) => p.id === 'bot:1') as { x: number; alive: boolean };
    run(g, 1500);
    expect((bot() as { x: number }).x).toBeGreaterThan(0.02);
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
    expect(g.snapshot().history).toHaveLength(1);
  });

  it('passes taps from people through to the game', () => {
    const inner = new RedLightGame(seeded(0.3));
    const tap = vi.spyOn(inner, 'tap');
    const g = new BotFiller(inner, 2, (id) => redLightBrain(id, seeded(0.5)));
    g.join('a');
    g.tap('a', 3);
    expect(tap).toHaveBeenCalledWith('a', 3);
  });

  it('numbers new bots from where the last left off, so a colour is not reused at once', () => {
    const g = filler();
    g.join('a');
    g.join('b');
    g.leave('b');
    expect(ids(g)).toEqual(['a', 'bot:2']);
  });
});
