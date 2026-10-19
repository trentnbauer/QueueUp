import { LOBBY_ACTION_NAME_MAX, LOBBY_TAP_TARGETS_MAX, LobbyRecord, createLobbyGame, lobbyVotesNeeded, pickLobbyGame, type LobbyGame, type LobbyGameId, type LobbyRunScore, type LobbySnapshot } from '@queueup/shared';

/** One room's live lobby: who is in it, who has voted to spin, and the mini game they are playing.
 * Pure state and rules - no sockets or timers (see spinLobbyHub.ts), so it is easy to test. A member
 * with several tabs open counts once: `join`/`leave` are reference-counted per person, and the game
 * only hears about the person arriving and leaving.
 *
 * Left to itself, the lobby plays a random game and, each time a run's result has been shown, moves
 * everyone to a different random one. The run number, the last results and each person's wins belong to
 * the lobby (a `LobbyRecord`), so they carry across the change. Given a game (as the tests do), it plays
 * only that. */
export class SpinLobby {
  private readonly connections = new Map<string, number>();
  private readonly votes = new Set<string>();
  private tickCount = 0;
  private readonly record = new LobbyRecord();
  private game: LobbyGame;
  private readonly rotates: boolean;

  /** `onScores` hears each finished run's scores, whichever game it was (for high scores). */
  constructor(game?: LobbyGame, private readonly onScores?: (game: LobbyGameId, scores: LobbyRunScore[]) => void) {
    this.rotates = game === undefined;
    if (game) this.hear(game);
    this.game = game ?? this.start(pickLobbyGame());
  }

  private hear(game: LobbyGame): void {
    if (this.onScores) game.onRunScores = (scores) => this.onScores?.(game.id, scores);
  }

  /** A new game of this kind, which hands over to the next one when its run is over. */
  private start(id: LobbyGameId): LobbyGame {
    const game = createLobbyGame(id, this.record);
    if (this.rotates) game.onRunOver = () => this.rotate(game);
    this.hear(game);
    return game;
  }

  /** Moves everyone from `from` to a different random game. False if `from` is not the current game. */
  private rotate(from: LobbyGame): boolean {
    if (from !== this.game || !this.rotates) return false;
    const next = this.start(pickLobbyGame(undefined, from.id));
    this.game = next;
    for (const userId of this.connections.keys()) next.join(userId);
    return true;
  }

  /** Members currently in the lobby. */
  get present(): string[] {
    return [...this.connections.keys()];
  }

  get size(): number {
    return this.connections.size;
  }

  join(userId: string): void {
    const n = this.connections.get(userId) ?? 0;
    this.connections.set(userId, n + 1);
    if (n === 0) this.game.join(userId);
  }

  /** One connection closed. The person leaves the lobby (and their vote goes) when their last one does. */
  leave(userId: string): void {
    const n = this.connections.get(userId);
    if (n === undefined) return;
    if (n > 1) {
      this.connections.set(userId, n - 1);
      return;
    }
    this.connections.delete(userId);
    this.votes.delete(userId);
    this.game.leave(userId);
    this.record.forget(userId);
  }

  setInput(userId: string, dx: unknown, dy: unknown): void {
    if (!this.connections.has(userId)) return;
    this.game.input(userId, dx === 1 || dx === -1 ? dx : 0, dy === 1 || dy === -1 ? dy : 0);
  }

  action(userId: string, name: unknown): void {
    if (!this.connections.has(userId) || typeof name !== 'string' || name.length > LOBBY_ACTION_NAME_MAX) return;
    this.game.action(userId, name);
  }

  /** A person's report of their own player, for a game that runs each player on their own device. The
   * game takes only the current run's report from someone in the lobby; anything malformed is dropped. */
  report(userId: string, run: unknown, alive: unknown, f: unknown): void {
    if (!this.connections.has(userId) || typeof run !== 'number' || !Number.isInteger(run) || typeof alive !== 'boolean') return;
    if (!f || typeof f !== 'object' || Array.isArray(f)) return;
    const fields: Record<string, number> = {};
    for (const [key, value] of Object.entries(f)) {
      if (key.length > 16 || typeof value !== 'number' || !Number.isFinite(value)) return;
      fields[key] = value;
    }
    this.game.report?.(userId, run, alive, fields);
  }

  /** A tap on one of the game's arena targets. Anything but a whole number in range is dropped. */
  tap(userId: string, target: unknown, ms?: unknown): void {
    if (!this.connections.has(userId) || typeof target !== 'number' || !Number.isInteger(target) || target < 0 || target >= LOBBY_TAP_TARGETS_MAX) return;
    this.game.tap?.(userId, target, typeof ms === 'number' ? ms : undefined);
  }

  vote(userId: string, on: boolean): void {
    if (!this.connections.has(userId)) return;
    if (on) this.votes.add(userId);
    else this.votes.delete(userId);
  }

  get needed(): number {
    return lobbyVotesNeeded(this.connections.size);
  }

  /** Whether more than half of the members in the lobby have voted to spin. */
  get votePassed(): boolean {
    return this.connections.size > 0 && this.votes.size >= this.needed;
  }

  tick(dtMs: number): void {
    this.tickCount++;
    this.game.tick(dtMs);
  }

  /** What `viewer` is sent (a game with hidden things shows each person their own; most are the same for
   * everyone). `now` is the server's clock, sent along with the run's start (for a game that
   * runs each player on their own device) so clients can line their clocks up and start together. */
  snapshot(spinWaiting: boolean, now?: number, viewer?: string): LobbySnapshot {
    const snapshot: LobbySnapshot = { t: 'state', tick: this.tickCount, game: this.game.snapshot(viewer), voters: [...this.votes], needed: this.needed, spinWaiting };
    const sim = this.game.simStart?.();
    if (sim && now !== undefined) {
      snapshot.sim = sim;
      snapshot.clock = now;
    }
    return snapshot;
  }
}
