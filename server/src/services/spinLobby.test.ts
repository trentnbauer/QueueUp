import { describe, expect, it, vi } from 'vitest';
import { SpinLobby } from './spinLobby.js';

const snapshot = () => ({ id: 'totem' as const, phase: 'lobby' as const, radius: 0.4, players: [], timerMs: 0, winnerId: null });
const fakeGame = () => ({
  id: 'totem' as const,
  join: vi.fn(),
  leave: vi.fn(),
  input: vi.fn(),
  action: vi.fn(),
  tick: vi.fn(),
  snapshot: vi.fn(snapshot),
});
const lobbyOf = (...ids: string[]) => {
  const lobby = new SpinLobby(fakeGame());
  ids.forEach((id) => lobby.join(id));
  return lobby;
};

describe('SpinLobby votes', () => {
  it('needs more than half of the members in the lobby', () => {
    const lobby = lobbyOf('a', 'b', 'c');
    expect(lobby.needed).toBe(2);
    lobby.vote('a', true);
    expect(lobby.votePassed).toBe(false);
    lobby.vote('b', true);
    expect(lobby.votePassed).toBe(true);
  });

  it('lets one person spin alone, and needs 3 of 4', () => {
    const solo = lobbyOf('a');
    solo.vote('a', true);
    expect(solo.votePassed).toBe(true);

    const four = lobbyOf('a', 'b', 'c', 'd');
    expect(four.needed).toBe(3);
    four.vote('a', true);
    four.vote('b', true);
    expect(four.votePassed).toBe(false);
  });

  it('only counts members who are in the lobby, and drops a vote when its owner leaves', () => {
    const lobby = lobbyOf('a', 'b', 'c');
    lobby.vote('a', true);
    lobby.vote('x', true); // never joined
    expect(lobby.snapshot(true).voters).toEqual(['a']);
    lobby.leave('a');
    expect(lobby.snapshot(true).voters).toEqual([]);
    expect(lobby.needed).toBe(2); // two members left
  });

  it('takes a vote back', () => {
    const lobby = lobbyOf('a', 'b');
    lobby.vote('a', true);
    lobby.vote('a', false);
    expect(lobby.snapshot(true).voters).toEqual([]);
  });

  it('counts a person with two tabs once, and keeps them until the last tab closes', () => {
    const lobby = lobbyOf('a', 'a');
    expect(lobby.size).toBe(1);
    lobby.vote('a', true);
    lobby.leave('a');
    expect(lobby.size).toBe(1);
    expect(lobby.votePassed).toBe(true);
    lobby.leave('a');
    expect(lobby.size).toBe(0);
    expect(lobby.votePassed).toBe(false);
  });
});

describe('SpinLobby and its game', () => {
  it('tells the game about a person once, however many tabs they have open', () => {
    const game = fakeGame();
    const lobby = new SpinLobby(game);
    lobby.join('a');
    lobby.join('a');
    expect(game.join).toHaveBeenCalledTimes(1);
    lobby.leave('a');
    expect(game.leave).not.toHaveBeenCalled();
    lobby.leave('a');
    expect(game.leave).toHaveBeenCalledWith('a');
  });

  it('passes clamped input and valid actions from people in the lobby, and nobody else', () => {
    const game = fakeGame();
    const lobby = new SpinLobby(game);
    lobby.join('a');
    lobby.setInput('a', 99, -1);
    expect(game.input).toHaveBeenCalledWith('a', 0, -1);
    lobby.setInput('stranger', 1, 0);
    lobby.action('a', 'punch');
    lobby.action('a', 42);
    lobby.action('a', 'x'.repeat(100));
    lobby.action('stranger', 'punch');
    expect(game.input).toHaveBeenCalledTimes(1);
    expect(game.action).toHaveBeenCalledTimes(1);
    expect(game.action).toHaveBeenCalledWith('a', 'punch');
  });

  it('ticks the game and includes its snapshot', () => {
    const game = fakeGame();
    const lobby = new SpinLobby(game);
    lobby.tick(66);
    expect(game.tick).toHaveBeenCalledWith(66);
    expect(lobby.snapshot(true)).toMatchObject({ t: 'state', tick: 1, spinWaiting: true, game: { id: 'totem' } });
  });
});
