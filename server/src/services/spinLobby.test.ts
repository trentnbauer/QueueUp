import { describe, expect, it, vi } from 'vitest';
import { BattleshipsGame, CoinsGame, LOBBY_GAME_IDS, LOBBY_WAITING_ROOM_LIMIT_S, RunnerGame, createLobbyGame } from '@queueup/shared';
import { LOBBY_IDLE_END_MS, SpinLobby } from './spinLobby.js';

const snapshot = () => ({ id: 'runner' as const, phase: 'lobby' as const, run: 1, history: [], best: null, limitMs: 0, meters: 0, speed: 0.5, obstacles: [], players: [], timerMs: 0, winnerId: null });
const fakeGame = () => ({
  id: 'runner' as const,
  join: vi.fn(),
  leave: vi.fn(),
  input: vi.fn(),
  action: vi.fn(),
  tap: vi.fn(),
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

  it('passes a tap on a target from people in the lobby, but only a whole number in range', () => {
    const game = fakeGame();
    const lobby = new SpinLobby(game);
    lobby.join('a');
    lobby.tap('a', 0);
    lobby.tap('a', 8);
    lobby.tap('a', 63);
    expect(game.tap).toHaveBeenCalledTimes(3);
    expect(game.tap).toHaveBeenCalledWith('a', 8, undefined);
    // Not a target index: dropped.
    for (const bad of [-1, 128, 1.5, Number.NaN, Infinity, '3', null, undefined, {}, [1]]) lobby.tap('a', bad);
    lobby.tap('stranger', 1);
    expect(game.tap).toHaveBeenCalledTimes(3);
  });

  it('ignores a tap when the game has no tap targets', () => {
    const game = { ...fakeGame(), tap: undefined };
    const lobby = new SpinLobby(game);
    lobby.join('a');
    expect(() => lobby.tap('a', 2)).not.toThrow();
  });

  it('ticks the game and includes its snapshot', () => {
    const game = fakeGame();
    const lobby = new SpinLobby(game);
    lobby.tick(66);
    expect(game.tick).toHaveBeenCalledWith(66);
    expect(lobby.snapshot(true)).toMatchObject({ t: 'state', tick: 1, spinWaiting: true, game: { id: 'runner' } });
  });
});

describe('SpinLobby with bots', () => {
  it('fills a game that needs two players with a bot that is not a member and cannot vote', () => {
    const lobby = new SpinLobby(createLobbyGame('sumo'));
    lobby.join('a');
    const game = lobby.snapshot(true).game;
    expect(game.players.map((p) => p.id)).toEqual(['a', 'bot:1']);
    expect(lobby.present).toEqual(['a']);
    expect(lobby.size).toBe(1);
    expect(lobby.needed).toBe(1);
    lobby.vote('bot:1', true);
    expect(lobby.votePassed).toBe(false);
    lobby.vote('a', true);
    expect(lobby.votePassed).toBe(true);
    lobby.leave('a');
    expect(lobby.snapshot(true).game.players).toEqual([]);
  });
});

describe('SpinLobby rotating games', () => {
  /** Ticks the lobby (every 66 ms, as the hub does) until the game on offer is a different one. */
  function untilGameChanges(lobby: SpinLobby, from: string) {
    for (let t = 0; t < 300_000; t += 66) {
      lobby.tick(66);
      if (lobby.snapshot(false).game.id !== from) return true;
    }
    return false;
  }

  it('moves everyone to a different game after a run, keeping the run number and the results', () => {
    const lobby = new SpinLobby();
    lobby.setTimeLimit(LOBBY_WAITING_ROOM_LIMIT_S);
    lobby.join('a');
    const firstGame = lobby.snapshot(false).game;
    expect(untilGameChanges(lobby, firstGame.id)).toBe(true);
    const next = lobby.snapshot(false).game;
    expect(next.id).not.toBe(firstGame.id);
    expect(next.players.map((p) => p.id)).toContain('a');
    // The first game's run is in the record, and the new game's first run is the second.
    expect(next.history).toHaveLength(1);
    expect(next.history[0].game).toBe(firstGame.id);
    expect(next.run).toBe(2);
  });

  it('ends a run of every game, for someone who does nothing, soon enough for a waiting room to move on', () => {
    // A spin's waiting room caps every run, so people who have wandered off do not hold it on one game.
    for (const id of LOBBY_GAME_IDS) {
      const lobby = new SpinLobby(createLobbyGame(id));
      lobby.setTimeLimit(LOBBY_WAITING_ROOM_LIMIT_S);
      lobby.join('a');
      let over = false;
      for (let t = 0; t < 40_000 && !over; t += 66) {
        lobby.tick(66);
        over = lobby.snapshot(false).game.phase === 'over';
      }
      expect(over, id).toBe(true);
    }
  });

  it('keeps going from game to game without losing anyone', () => {
    const lobby = new SpinLobby();
    lobby.setTimeLimit(LOBBY_WAITING_ROOM_LIMIT_S);
    lobby.join('a');
    lobby.join('b');
    const seen = new Set<string>();
    let game = lobby.snapshot(false).game.id;
    seen.add(game);
    for (let i = 0; i < 4; i++) {
      expect(untilGameChanges(lobby, game)).toBe(true);
      game = lobby.snapshot(false).game.id;
      seen.add(game);
      expect(lobby.snapshot(false).game.players.map((p) => p.id)).toEqual(expect.arrayContaining(['a', 'b']));
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(lobby.snapshot(false).game.history.length).toBeGreaterThanOrEqual(4);
  });

  it('puts someone who joins between games into the current one', () => {
    const lobby = new SpinLobby();
    lobby.setTimeLimit(LOBBY_WAITING_ROOM_LIMIT_S);
    lobby.join('a');
    const first = lobby.snapshot(false).game.id;
    untilGameChanges(lobby, first);
    lobby.join('b');
    expect(lobby.snapshot(false).game.players.map((p) => p.id)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('only plays the game it is given, when given one', () => {
    const game = fakeGame();
    const lobby = new SpinLobby(game);
    lobby.join('a');
    for (let t = 0; t < 10_000; t += 66) lobby.tick(66);
    expect(lobby.snapshot(false).game.id).toBe('runner');
    expect((game as { onRunOver?: unknown }).onRunOver).toBeUndefined();
  });
});

describe('SpinLobby showing each person their own view', () => {
  const started = () => {
    const lobby = new SpinLobby(new BattleshipsGame(() => 0.3));
    lobby.join('a');
    lobby.join('b');
    for (let t = 0; t < 3200; t += 66) lobby.tick(66);
    return lobby;
  };
  const game = (lobby: SpinLobby, viewer?: string) => lobby.snapshot(false, undefined, viewer).game as unknown as { mine: number[][] | null; cells: number[]; players: { id: string; shots: number }[] };

  it('sends each person their own ships and nobody else theirs', () => {
    const lobby = started();
    const a = game(lobby, 'a');
    const b = game(lobby, 'b');
    expect(a.mine?.length).toBeGreaterThan(0);
    expect(b.mine?.length).toBeGreaterThan(0);
    expect(a.mine).not.toEqual(b.mine);
    // Someone watching, or not in the lobby, is shown no ships.
    expect(game(lobby).mine).toBeNull();
    expect(game(lobby, 'stranger').mine).toBeNull();
    // Everything but `mine` is the same for everyone, and so says nothing about where anyone's ships are.
    const rest = (viewer?: string) => ({ ...lobby.snapshot(false, undefined, viewer), game: { ...game(lobby, viewer), mine: null } });
    expect(rest('a')).toEqual(rest('b'));
    expect(game(lobby, 'a').cells.every((c) => c === 0)).toBe(true);
  });

  it('takes a tap on a square to shoot, up to the limit of tap targets', () => {
    const lobby = started();
    lobby.tap('a', 3);
    lobby.tap('a', 127);
    lobby.tap('a', 128);
    expect(game(lobby, 'a').players.find((p) => p.id === 'a')?.shots).toBeLessThanOrEqual(1);
  });
});

describe('SpinLobby with a game that runs each player on their own device', () => {
  const started = () => {
    const lobby = new SpinLobby(new RunnerGame(() => 0.3));
    lobby.join('a');
    lobby.join('b');
    for (let t = 0; t < 3200; t += 66) lobby.tick(66);
    return lobby;
  };

  it('sends the run, its seed and when it starts, with the server clock', () => {
    const lobby = new SpinLobby(new RunnerGame(() => 0.3));
    lobby.join('a');
    const counting = lobby.snapshot(false, 5000);
    expect(counting.sim).toMatchObject({ run: 1, startInMs: 3000 });
    expect(typeof counting.sim?.seed).toBe('number');
    expect(counting.clock).toBe(5000);
    for (let t = 0; t < 3200; t += 66) lobby.tick(66);
    const running = lobby.snapshot(false, 9000);
    expect(running.sim?.seed).toBe(counting.sim?.seed);
    expect(running.sim?.startInMs).toBeLessThan(0);
  });

  it('sends nothing extra without a clock, or for a game that does not run on the client', () => {
    const lobby = new SpinLobby(new RunnerGame(() => 0.3));
    lobby.join('a');
    expect(lobby.snapshot(false).sim).toBeUndefined();
    const other = new SpinLobby(new CoinsGame(() => 0.3));
    other.join('a');
    expect(other.snapshot(false, 1000).sim).toBeUndefined();
    expect(other.snapshot(false, 1000).clock).toBeUndefined();
  });

  it('takes a report from someone in the lobby', () => {
    const lobby = started();
    lobby.report('a', 1, false, { h: 0, vy: 0, duck: 0 });
    const players = lobby.snapshot(false, 1).game.players as { id: string; alive: boolean }[];
    expect(players.find((p) => p.id === 'a')?.alive).toBe(false);
    expect(players.find((p) => p.id === 'b')?.alive).toBe(true);
  });

  it('drops a report that is malformed, from a stranger, or has odd fields', () => {
    const lobby = started();
    const alive = () => (lobby.snapshot(false, 1).game.players as { id: string; alive: boolean }[]).every((p) => p.alive);
    lobby.report('stranger', 1, false, {});
    lobby.report('a', 'one', false, {});
    lobby.report('a', 1.5, false, {});
    lobby.report('a', 1, 'no', {});
    lobby.report('a', 1, false, null);
    lobby.report('a', 1, false, [1, 2]);
    lobby.report('a', 1, false, { h: 'high' });
    lobby.report('a', 1, false, { h: Number.NaN });
    lobby.report('a', 1, false, { ['x'.repeat(40)]: 1 });
    expect(alive()).toBe(true);
    lobby.report('a', 1, false, { h: 0 });
    expect(alive()).toBe(false);
  });

  it('ignores a report when the game has no client sim', () => {
    const lobby = new SpinLobby(fakeGame());
    lobby.join('a');
    expect(() => lobby.report('a', 1, true, { h: 0 })).not.toThrow();
  });
});

describe('SpinLobby picking games by how much each has been played', () => {
  it('opens on, and moves to, the games the weights favour (never the one just played)', () => {
    const only = (id: (typeof LOBBY_GAME_IDS)[number]) => Object.fromEntries(LOBBY_GAME_IDS.map((g) => [g, g === id ? 1 : 0]));
    const lobby = new SpinLobby(undefined, undefined, () => only('words'));
    lobby.join('a');
    expect(lobby.snapshot(false).game.id).toBe('words');
    // With the weights moved to another game, the next pick follows them.
    const moving = new SpinLobby(undefined, undefined, () => only('sumo'));
    moving.join('a');
    expect(moving.snapshot(false).game.id).toBe('sumo');
  });
});

describe('SpinLobby time limit', () => {
  it('caps a run when asked, and lifts the cap again', () => {
    const lobby = new SpinLobby(createLobbyGame('sumo'));
    lobby.join('a');
    lobby.setTimeLimit(LOBBY_WAITING_ROOM_LIMIT_S);
    expect(lobby.snapshot(false).game.limitMs).toBe(LOBBY_WAITING_ROOM_LIMIT_S * 1000);
    lobby.setTimeLimit(null);
    expect(lobby.snapshot(false).game.limitMs).toBe(0);
  });
});

describe('SpinLobby and who the server believes', () => {
  const finish = (game: ReturnType<typeof createLobbyGame>) => game.onRunScores?.([{ userId: 'a', score: 5 }]);

  it('marks the scores of a game each device works out for itself as unverified, and others as verified', () => {
    const heard = vi.fn();
    const device = createLobbyGame('dodge');
    expect(device.clientSim).toBe(true);
    new SpinLobby(device, heard);
    finish(device);
    expect(heard).toHaveBeenLastCalledWith('dodge', [{ userId: 'a', score: 5 }], false);

    const server = createLobbyGame('words');
    expect(server.clientSim).toBeFalsy();
    new SpinLobby(server, heard);
    finish(server);
    expect(heard).toHaveBeenLastCalledWith('words', [{ userId: 'a', score: 5 }], true);
  });

  it('has the server work out a practice run itself: reports from the device are ignored and its scores are verified', () => {
    const heard = vi.fn();
    const game = createLobbyGame('dodge');
    const report = vi.spyOn(game, 'report');
    const lobby = new SpinLobby(game, heard, undefined, true);
    lobby.join('a');
    // The device may still run a copy of the run to draw (so it feels instant)...
    expect(lobby.snapshot(false, 1000, 'a').sim).toBeDefined();
    // ...but a report from it is ignored, so the server keeps simulating the player from their presses...
    lobby.report('a', 1, true, { x: 0.5, dir: 0 });
    expect(report).not.toHaveBeenCalled();
    // ...and what it scores is the server's own.
    finish(game);
    expect(heard).toHaveBeenLastCalledWith('dodge', [{ userId: 'a', score: 5 }], true);
  });
});

describe('SpinLobby idle rule', () => {
  const phaseOf = (lobby: SpinLobby) => (lobby.snapshot(false).game as unknown as { phase: string }).phase;
  /** Ticks for `ms`, the way the server does. */
  const run = (lobby: SpinLobby, ms: number) => {
    for (let t = 0; t < ms; t += 100) lobby.tick(100);
  };

  it('ends a run in a game that waits on its players when nobody has pressed anything for a minute, and starts another', () => {
    for (const id of ['mines', 'battleships', 'draw'] as const) {
      const lobby = new SpinLobby(createLobbyGame(id));
      lobby.join('a');
      lobby.join('b');
      run(lobby, 5000);
      expect(phaseOf(lobby), id).toBe('playing');
      // The run that was on ends (a result is recorded), and the next one begins.
      run(lobby, LOBBY_IDLE_END_MS + 2000);
      const game = lobby.snapshot(false).game as unknown as { history: unknown[]; run: number };
      expect(game.history.length, id).toBeGreaterThan(0);
      expect(game.run, id).toBeGreaterThan(1);
    }
  });

  it('is held off by someone pressing, and by someone arriving', () => {
    const lobby = new SpinLobby(createLobbyGame('mines'));
    lobby.join('a');
    run(lobby, 5000);
    for (let i = 0; i < 4; i++) {
      run(lobby, LOBBY_IDLE_END_MS - 5000);
      lobby.action('a', 'noop');
    }
    expect(phaseOf(lobby)).toBe('playing');
    run(lobby, LOBBY_IDLE_END_MS - 5000);
    lobby.join('b');
    run(lobby, 10_000);
    expect(phaseOf(lobby)).toBe('playing');
  });
});

describe('SpinLobby: how far behind a press was', () => {
  it('tells the game while it handles the press, clamped, and resets it after', () => {
    const seen: number[] = [];
    const game = { ...fakeGame(), pressBehindMs: 0, action: vi.fn(function (this: { pressBehindMs: number }) { seen.push(this.pressBehindMs); }) };
    const lobby = new SpinLobby(game as never);
    lobby.join('a');
    lobby.action('a', 'stop', undefined, undefined, 120);
    lobby.action('a', 'stop', undefined, undefined, 99999);
    lobby.action('a', 'stop', undefined, undefined, -5);
    lobby.action('a', 'stop', undefined, undefined, 'soon');
    lobby.action('a', 'stop');
    expect(seen).toEqual([120, 400, 0, 0, 0]);
    expect(game.pressBehindMs).toBe(0);
  });
});
