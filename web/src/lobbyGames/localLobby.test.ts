import { describe, expect, it, vi } from 'vitest';
import { DodgeGame, LOBBY_GAME_IDS, LobbyRecord, createLobbyGame } from '@queueup/shared';
import { LocalLobby } from './localLobby';

describe('LocalLobby', () => {
  it('puts you in the game alone, in a countdown, with nothing to vote on', () => {
    const lobby = new LocalLobby('runner', 'me');
    const snap = lobby.snapshot();
    expect(snap.t).toBe('state');
    expect(snap.game.players.map((p) => p.id)).toEqual(['me']);
    expect(snap.game.phase).toBe('countdown');
    expect(snap).toMatchObject({ voters: [], spinWaiting: false });
  });

  it('plays a run: the countdown ends, then it is on', () => {
    const lobby = new LocalLobby('flappy', 'me');
    for (let t = 0; t < 3300; t += 66) lobby.tick(66);
    expect(lobby.snapshot().game.phase).toBe('playing');
    expect(lobby.snapshot().tick).toBeGreaterThan(40);
  });

  it('plays a solo run to the end and starts the next one by itself', () => {
    // A course from a fixed seed: with a random one, standing still can stay in the safe lane for longer than
    // this waits, and the test fails now and then.
    const record = new LobbyRecord();
    const lobby = new LocalLobby('dodge', 'me', record, new DodgeGame(() => 0.3, record));
    for (let t = 0; t < 3200; t += 66) lobby.tick(66);
    // Standing still, a block eventually lands on you.
    for (let t = 0; t < 30_000 && lobby.snapshot().game.phase === 'playing'; t += 66) lobby.tick(66);
    expect(lobby.snapshot().game.phase).toBe('over');
    expect(lobby.snapshot().game.history).toHaveLength(1);
    for (let t = 0; t < 4300; t += 66) lobby.tick(66);
    expect(lobby.snapshot().game.phase).toBe('countdown');
    expect(lobby.snapshot().game.run).toBe(2);
  });

  it('passes your input and actions on, clamping the direction', () => {
    const game = createLobbyGame('runner');
    const input = vi.spyOn(game, 'input');
    const action = vi.spyOn(game, 'action');
    const lobby = new LocalLobby('runner', 'me', undefined, game);
    lobby.input(99, -1);
    lobby.action('jump');
    expect(input).toHaveBeenCalledWith('me', 0, -1);
    expect(action).toHaveBeenCalledWith('me', 'jump');
  });

  it('passes your taps on to the game', () => {
    const game = createLobbyGame('runner');
    const tap = vi.spyOn(game, 'tap');
    const lobby = new LocalLobby('runner', 'me', undefined, game);
    lobby.tap(4);
    expect(tap).toHaveBeenCalledWith('me', 4, undefined);
  });

  it('can run every game there is', () => {
    for (const id of LOBBY_GAME_IDS) {
      const lobby = new LocalLobby(id, 'me');
      lobby.tick(66);
      expect(lobby.snapshot().game.id).toBe(id);
    }
  });
});

describe('LocalLobby record', () => {
  it('keeps the run number and results when practising moves to another game', () => {
    const record = new LobbyRecord();
    const first = new LocalLobby('runner', 'me', record);
    for (let t = 0; t < 3300; t += 66) first.tick(66);
    // Standing still, the first obstacle ends the run.
    for (let t = 0; t < 30_000 && first.snapshot().game.phase === 'playing'; t += 66) first.tick(66);
    expect(first.snapshot().game.history).toHaveLength(1);

    const second = new LocalLobby('dodge', 'me', record);
    const snap = second.snapshot().game;
    expect(snap.history).toHaveLength(1);
    expect(snap.history[0].game).toBe('runner');
    expect(snap.run).toBe(2);
  });

  it('starts fresh when no record is given', () => {
    const lobby = new LocalLobby('dodge', 'me');
    expect(lobby.snapshot().game.history).toEqual([]);
    expect(lobby.snapshot().game.run).toBe(1);
  });
});
