import { describe, expect, it, vi } from 'vitest';
import { LOBBY_GAME_IDS, LOBBY_HISTORY_LENGTH, type LobbyGameId } from '../spinLobby.js';
import { DodgeGame } from './dodge.js';
import { createLobbyGame, lobbyPickWeights, pickLobbyGame } from './index.js';
import { LobbyRecord, secureRandom } from './roundGame.js';
import { RunnerGame } from './runner.js';

const STEP = 33;
const seeded = (seed: number) => () => seed;
const run = (g: { tick(ms: number): void }, ms: number) => {
  for (let t = 0; t < ms; t += STEP) g.tick(STEP);
};

/** Plays a game's solo run out: it starts, the player never moves and is knocked out, and the result shows. */
function playOut(g: RunnerGame | DodgeGame) {
  run(g, 3200);
  for (let t = 0; t < 120_000 && g.snapshot().phase === 'playing'; t += STEP) g.tick(STEP);
}

describe('LobbyRecord', () => {
  it('keeps the last ten runs, oldest first, from every game', () => {
    const record = new LobbyRecord();
    for (let i = 1; i <= LOBBY_HISTORY_LENGTH + 3; i++) record.add({ id: 'a', winnerId: null, meters: i, game: i % 2 ? 'runner' : 'dodge' });
    expect(record.history).toHaveLength(LOBBY_HISTORY_LENGTH);
    expect(record.history[0].meters).toBe(4);
    expect(record.history[record.history.length - 1].meters).toBe(LOBBY_HISTORY_LENGTH + 3);
  });

  it('keeps a best run for each game, since metres, coins and swings cannot be compared', () => {
    const record = new LobbyRecord();
    record.add({ id: 'a', winnerId: null, meters: 500, game: 'runner' });
    record.add({ id: 'b', winnerId: null, meters: 12, game: 'coins' });
    record.add({ id: 'a', winnerId: null, meters: 7, game: 'coins' });
    expect(record.best.get('runner')?.meters).toBe(500);
    expect(record.best.get('coins')).toMatchObject({ meters: 12, id: 'b' });
    expect(record.best.has('dodge')).toBe(false);
  });

  it('forgets a person who left the lobby', () => {
    const record = new LobbyRecord();
    record.wins.set('a', 3);
    record.wins.set('b', 1);
    record.forget('a');
    expect([...record.wins]).toEqual([['b', 1]]);
  });
});

describe('a record shared by the games a lobby plays', () => {
  it('carries the run number, results and wins from one game to the next', () => {
    const record = new LobbyRecord();
    const first = new RunnerGame(seeded(0.3), record);
    first.join('a');
    first.join('b');
    run(first, 3200);
    first.input('b', 0, -1); // `b` jumps once and then stays out of trouble for a moment; `a` never does anything
    playOut(first);
    expect(first.snapshot().history).toHaveLength(1);
    expect(first.snapshot().run).toBe(1);

    // The lobby moves to another game: the record goes with it.
    const second = new DodgeGame(seeded(0.6), record);
    second.join('a');
    second.join('b');
    const snap = second.snapshot();
    expect(snap.run).toBe(2);
    expect(snap.history).toHaveLength(1);
    expect(snap.history[0].game).toBe('runner');
    // The new game has no best run of its own yet, though the first game has one.
    expect(snap.best).toBeNull();
    expect(first.snapshot().best).not.toBeNull();

    playOut(second);
    const after = second.snapshot();
    expect(after.history).toHaveLength(2);
    expect(after.history.map((r) => r.game)).toEqual(['runner', 'dodge']);
    expect(after.best?.game).toBe('dodge');
  });

  it('gives people their wins back in the next game', () => {
    const record = new LobbyRecord();
    record.wins.set('a', 2);
    const g = new DodgeGame(seeded(0.3), record);
    g.join('a');
    g.join('b');
    expect(g.snapshot().players.find((p) => p.id === 'a')?.wins).toBe(2);
    expect(g.snapshot().players.find((p) => p.id === 'b')?.wins).toBe(0);
  });

  it('writes a win into the record', () => {
    const record = new LobbyRecord();
    const g = new RunnerGame(seeded(0.3), record);
    g.join('a');
    g.join('b');
    run(g, 3200);
    // Only `a` jumps over the first cactus, so `b` is knocked out and `a` wins, or both are out.
    for (let t = 0; t < 60_000 && g.snapshot().phase === 'playing'; t += STEP) {
      const first = g.snapshot().obstacles[0];
      if (first && first.x < 0.4) g.action('a', 'jump');
      g.tick(STEP);
    }
    const winner = g.snapshot().winnerId;
    if (winner) expect(record.wins.get(winner)).toBe(1);
    else expect([...record.wins]).toEqual([]);
  });

  it('starts with an empty record, as every game did before', () => {
    const g = new RunnerGame(seeded(0.3));
    g.join('a');
    expect(g.snapshot().run).toBe(1);
    expect(g.snapshot().history).toEqual([]);
    expect(g.snapshot().best).toBeNull();
  });
});

describe('moving on after a run', () => {
  it('asks the lobby when the result screen ends, and finishes if the lobby has moved on', () => {
    const g = new RunnerGame(seeded(0.3));
    let asked = 0;
    g.onRunOver = () => {
      asked++;
      return true;
    };
    g.join('a');
    playOut(g);
    expect(g.snapshot().phase).toBe('over');
    run(g, 4200);
    expect(asked).toBe(1);
    // It did not start another run, and has no players left.
    expect(g.snapshot().phase).toBe('lobby');
    expect(g.snapshot().players).toEqual([]);
    run(g, 10_000);
    expect(asked).toBe(1);
  });

  it('plays another run of the same game when the lobby does not move on', () => {
    const g = new RunnerGame(seeded(0.3));
    g.onRunOver = () => false;
    g.join('a');
    playOut(g);
    run(g, 4200);
    expect(g.snapshot().phase).toBe('countdown');
    expect(g.snapshot().run).toBe(2);
  });
});

describe('pickLobbyGame', () => {
  it('never picks the game you say not to, as long as there is another', () => {
    for (const id of LOBBY_GAME_IDS) {
      for (let i = 0; i < 200; i++) expect(pickLobbyGame(Math.random, id)).not.toBe(id);
    }
  });

  it('can pick any of the other games', () => {
    const seen = new Set<LobbyGameId>();
    for (let i = 0; i < LOBBY_GAME_IDS.length; i++) seen.add(pickLobbyGame(() => i / LOBBY_GAME_IDS.length, 'runner'));
    expect(seen.has('runner')).toBe(false);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('picks from all of them when nothing is excluded', () => {
    expect(pickLobbyGame(() => 0)).toBe(LOBBY_GAME_IDS[0]);
    expect(pickLobbyGame(() => 0.999)).toBe(LOBBY_GAME_IDS[LOBBY_GAME_IDS.length - 1]);
  });

  it('leans toward the games that have been played least, but every game still comes up', () => {
    // A small seeded source, so the counts below are the same every run.
    let s = 12345;
    const random = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const plays = Object.fromEntries(LOBBY_GAME_IDS.map((id) => [id, 500])) as Record<LobbyGameId, number>;
    plays.words = 0;
    plays.runner = 5000;
    const weights = lobbyPickWeights(plays);
    const seen = new Map<LobbyGameId, number>();
    for (let i = 0; i < 20_000; i++) {
      const id = pickLobbyGame(random, undefined, weights);
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    const most = Math.max(...seen.values());
    expect(seen.get('words')).toBe(most);
    expect(seen.get('words')!).toBeGreaterThan(seen.get('dodge')!);
    expect(seen.get('dodge')!).toBeGreaterThan(seen.get('runner')!);
    for (const id of LOBBY_GAME_IDS) expect(seen.get(id) ?? 0).toBeGreaterThan(0);
  });

  it('never repeats the previous game even when it is the least played', () => {
    const weights = lobbyPickWeights({ words: 0, runner: 100 });
    for (let i = 0; i < 500; i++) expect(pickLobbyGame(Math.random, 'words', weights)).not.toBe('words');
  });

  it('is even with no counts yet, and with weights left out', () => {
    const weights = lobbyPickWeights({});
    expect(new Set(Object.values(weights)).size).toBe(1);
    expect(Object.values(weights).every((w) => w > 0)).toBe(true);
    expect(pickLobbyGame(() => 0, undefined, weights)).toBe(LOBBY_GAME_IDS[0]);
    expect(pickLobbyGame(() => 0.999, undefined, weights)).toBe(LOBBY_GAME_IDS[LOBBY_GAME_IDS.length - 1]);
  });

  it('hands out games that share a record through createLobbyGame', () => {
    const record = new LobbyRecord();
    const a = createLobbyGame('runner', record);
    a.join('me');
    const b = createLobbyGame('dodge', record);
    b.join('me');
    expect(b.snapshot().run).toBe(2);
  });
});

describe('a lobby\'s time limit', () => {
  it('ends a run of a game that would otherwise go on, keeps what the survivors got, and shows the limit', () => {
    const g = createLobbyGame('dodge');
    const scores: { userId: string; score: number }[][] = [];
    g.onRunScores = (s) => scores.push(s);
    g.join('a');
    g.join('b');
    run(g, 3200);
    expect(g.snapshot().limitMs).toBe(0);
    g.timeLimitS = 10;
    expect(g.snapshot().limitMs).toBe(10_000);
    for (let t = 0; t < 12_000 && g.snapshot().phase === 'playing'; t += 33) g.tick(33);
    expect(g.snapshot().phase).toBe('over');
    expect(g.snapshot().history.at(-1)?.game).toBe('dodge');
  });

  it('can be set on a game with bots, and lifted again', () => {
    const g = createLobbyGame('draw');
    g.timeLimitS = 30;
    expect(g.timeLimitS).toBe(30);
    g.join('a');
    expect(g.snapshot().limitMs).toBe(30_000);
    g.timeLimitS = null;
    expect(g.snapshot().limitMs).toBe(0);
  });
});

describe('randomness', () => {
  it('draws secure numbers spread evenly over [0, 1)', () => {
    const draws = Array.from({ length: 20_000 }, secureRandom);
    expect(draws.every((r) => r >= 0 && r < 1)).toBe(true);
    for (let q = 0; q < 4; q++) expect(draws.filter((r) => Math.floor(r * 4) === q).length).toBeGreaterThan(4500);
  });

  it('never seeds a run, picks the next game or fills bots from Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      for (const id of LOBBY_GAME_IDS) {
        const g = createLobbyGame(id);
        g.join('a');
        run(g, 3200);
        pickLobbyGame(undefined, id);
      }
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
