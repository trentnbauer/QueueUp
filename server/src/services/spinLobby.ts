import { LOBBY_ACTION_NAME_MAX, LOBBY_TAP_TARGETS_MAX, LOBBY_GAME_IDS, LobbyRecord, createLobbyGame, lobbyVotesNeeded, pickLobbyGame, type LobbyGame, type LobbyGameId, type LobbyRunScore, type LobbySnapshot } from '@queueup/shared';

/** How far behind its player's device a practice lobby runs a game that the device also works out. The device sends each press with the
 * moment of the run it happened at; the server runs this much later than the device, so the press has arrived before the server needs it
 * and applies it at exactly that moment. Both then play the same run, so what the player saw is what is scored (a press that took
 * 100 ms to arrive used to land the server's player somewhere else and knock them out for something the screen never showed). A
 * press that takes longer than this to arrive is applied late. */
export const SOLO_DELAY_MS = 300;
/** The server's steps in a delayed practice run are these, the same as the device's, so the two work out the same run. */
const STEP_MS = 1000 / 60;
/** A run is ended if nobody in the lobby has pressed anything for this long (everyone has wandered off), so a lobby set to Infinite, or a game with
 * no clock of its own, cannot be held open by people who are not there. */
export const LOBBY_IDLE_END_MS = 60_000;

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
  /** The cap on a run in seconds (a spin's waiting room sets one), or null. Every game the lobby plays gets it. */
  private timeLimitS: number | null = null;
  /** Time that has gone by that a delayed practice game has not been given yet (see SOLO_DELAY_MS). */
  private owed = 0;
  /** How long it is since anyone pressed anything (see LOBBY_IDLE_END_MS). */
  private quietMs = 0;

  /** `onScores` hears each finished run's scores, whichever game it was (for high scores), and whether the
   * server can vouch for them: false when the game worked out each player on their own device (see `trusts`). */
  constructor(
    game?: LobbyGame,
    private readonly onScores?: (game: LobbyGameId, scores: LobbyRunScore[], verified: boolean) => void,
    /** How likely each game is to come up, from how much each has been played across the server (see
     * playWeights.ts); read at each pick. Without it every game is equally likely. */
    private readonly weights?: () => Partial<Record<LobbyGameId, number>>,
    /** A practice lobby (one person): the server works out their play from their inputs, whatever the game, never from
     * what their device says, so nothing in it can be forged. The device still runs its own copy to draw (see ClientSim), so
     * the game feels instant, but its reports are ignored. */
    readonly solo = false,
  ) {
    this.rotates = game === undefined;
    if (game) this.hear(game);
    this.game = game ?? this.start(this.pick());
  }

  /** The next game: leaning to the ones played less across the server, and less in this lobby so far, and never
   * the one just played. */
  private pick(not?: LobbyGameId): LobbyGameId {
    const server = this.weights?.() ?? {};
    const weights = Object.fromEntries(LOBBY_GAME_IDS.map((id) => [id, (server[id] ?? 1) / (1 + this.record.history.filter((r) => r.game === id).length)]));
    return pickLobbyGame(undefined, not, weights);
  }

  private hear(game: LobbyGame): void {
    if (this.onScores) game.onRunScores = (scores) => this.onScores?.(game.id, scores, this.trusts(game));
  }

  /** Whether the server saw these players' runs happen. A game that runs each player on their own device (see
   * `RoundGame.clientSim`) takes the device's word for where they are, so a modified client could report that it never
   * got hit: its scores are kept, but marked, and left off the high score lists. A practice lobby has the server do the
   * work instead, so its scores are the server's own. */
  private trusts(game: LobbyGame): boolean {
    return this.solo || !game.clientSim;
  }

  /** A new game of this kind, which hands over to the next one when its run is over. */
  private start(id: LobbyGameId): LobbyGame {
    const game = createLobbyGame(id, this.record);
    game.timeLimitS = this.timeLimitS;
    if (this.rotates) game.onRunOver = () => this.rotate(game);
    this.hear(game);
    return game;
  }

  /** Moves everyone from `from` to a different random game. False if `from` is not the current game. */
  private rotate(from: LobbyGame): boolean {
    if (from !== this.game || !this.rotates) return false;
    const next = this.start(this.pick(from.id));
    this.game = next;
    for (const userId of this.connections.keys()) next.join(userId);
    return true;
  }

  /** Caps every run at this many seconds from now on (null lifts the cap), including the one under way. */
  setTimeLimit(seconds: number | null): void {
    this.timeLimitS = seconds;
    this.game.timeLimitS = seconds;
  }

  /** The cap on a run right now, in seconds, or null for none. */
  get timeLimit(): number | null {
    return this.timeLimitS;
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
    if (n === 0) {
      this.game.join(userId);
      this.quietMs = 0;
    }
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

  /** Whether this lobby runs its game a little behind the person's device (a practice run of a game the device also works out). */
  private get delayed(): boolean {
    return this.solo && !!this.game.clientSim;
  }

  /** `run` and `at` say when on the device's copy of the run the press was made (see SOLO_DELAY_MS); without them it is applied at once. */
  setInput(userId: string, dx: unknown, dy: unknown, run?: unknown, at?: unknown): void {
    if (!this.connections.has(userId)) return;
    const x = dx === 1 || dx === -1 ? dx : 0;
    const y = dy === 1 || dy === -1 ? dy : 0;
    this.quietMs = 0;
    if (this.delayed && this.game.inputAt && typeof run === 'number' && Number.isInteger(run) && typeof at === 'number' && Number.isFinite(at)) this.game.inputAt(userId, run, at, x, y);
    else this.game.input(userId, x, y);
  }

  action(userId: string, name: unknown, run?: unknown, at?: unknown): void {
    if (!this.connections.has(userId) || typeof name !== 'string' || name.length > LOBBY_ACTION_NAME_MAX) return;
    this.quietMs = 0;
    if (this.delayed && this.game.actionAt && typeof run === 'number' && Number.isInteger(run) && typeof at === 'number' && Number.isFinite(at)) this.game.actionAt(userId, run, at, name);
    else this.game.action(userId, name);
  }

  /** A person's report of their own player, for a game that runs each player on their own device. The
   * game takes only the current run's report from someone in the lobby; anything malformed is dropped. */
  report(userId: string, run: unknown, alive: unknown, f: unknown): void {
    if (this.solo) return; // the server works out a practice run itself; the device's copy is only for showing it
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
  tap(userId: string, target: unknown, ms?: unknown, run?: unknown, at?: unknown): void {
    if (!this.connections.has(userId) || typeof target !== 'number' || !Number.isInteger(target) || target < 0 || target >= LOBBY_TAP_TARGETS_MAX) return;
    this.quietMs = 0;
    if (this.delayed && this.game.tapAt && typeof run === 'number' && Number.isInteger(run) && typeof at === 'number' && Number.isFinite(at)) this.game.tapAt(userId, run, at, target);
    else this.game.tap?.(userId, target, typeof ms === 'number' ? ms : undefined);
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
    this.quietMs += Math.min(dtMs, 250);
    if (this.quietMs >= LOBBY_IDLE_END_MS && this.game.endIdle?.()) this.quietMs = 0;
    if (!this.delayed) {
      this.owed = 0;
      this.game.tick(dtMs);
      return;
    }
    // Keep SOLO_DELAY_MS of time back, and hand the rest over in the device's own steps.
    this.owed += Math.min(dtMs, 250);
    while (this.owed >= SOLO_DELAY_MS + STEP_MS) {
      this.game.tick(STEP_MS);
      this.owed -= STEP_MS;
    }
  }

  /** What `viewer` is sent (a game with hidden things shows each person their own; most are the same for
   * everyone). `now` is the server's clock, sent along with the run's start (for a game that
   * runs each player on their own device) so clients can line their clocks up and start together. */
  snapshot(spinWaiting: boolean, now?: number, viewer?: string): LobbySnapshot {
    const snapshot: LobbySnapshot = { t: 'state', tick: this.tickCount, game: this.game.snapshot(viewer), voters: [...this.votes], needed: this.needed, spinWaiting, capSeconds: this.timeLimitS ?? 0 };
    const sim = this.game.simStart?.();
    if (sim && now !== undefined) {
      // The game here is SOLO_DELAY_MS behind, so the device starts that much before it does.
      snapshot.sim = this.delayed ? { ...sim, startInMs: sim.startInMs - SOLO_DELAY_MS } : sim;
      snapshot.clock = now;
    }
    return snapshot;
  }
}
