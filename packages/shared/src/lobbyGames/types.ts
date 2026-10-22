import type { LobbyGameId, LobbyGameSnapshot, LobbyRunScore, LobbySim } from '../spinLobby.js';

/** A mini game the room lobby can run. Pure rules and state - no sockets, timers or database - so a
 * game is easy to test and to add: give it an id (packages/shared/src/spinLobby.ts), a snapshot type,
 * this interface, an entry in `createLobbyGame` (index.ts) and a renderer in the web app
 * (web/src/lobbyGames/). The server drives `tick` at LOBBY_TICK_HZ and sends `snapshot()` to everyone.
 * Games are cosmetic: nothing here may touch a spin. */
export interface LobbyGame {
  readonly id: LobbyGameId;
  /** The fewest players the game needs to be worth playing (default 1). With fewer people in the lobby,
   * the lobby adds bots until there are this many (see bots.ts). */
  readonly minPlayers?: number;
  /** A member arrived (the lobby calls this once per person, not once per tab). */
  join(userId: string): void;
  leave(userId: string): void;
  /** Set by the lobby that owns the game: called when a run's result has been shown and the next run is
   * about to start. Return true if the lobby has moved everyone to another game. */
  onRunOver?: () => boolean;
  /** A cap on how long each run can last, in seconds, set by the lobby (a spin's waiting room sets one); null for
   * none beyond the game's own. A game with no limit of its own goes on until it is beaten. */
  timeLimitS?: number | null;
  /** True for a game that runs each player on their own device: the player's own movement and hits are
   * worked out by their client (so ping does not matter), which reports where they are, while the server
   * keeps the shared parts (the seed, when the run starts, who is still in, the result). Only for games
   * where players do not affect each other. */
  readonly clientSim?: boolean;
  /** For a client-sim game: the run that is about to start or is on (null otherwise). */
  simStart?(): LobbySim | null;
  /** For a client-sim game: a person's report of their own player (the server side). */
  report?(userId: string, run: number, alive: boolean, f: Record<string, number>): void;
  /** For a client-sim game, on the client: starts the run from the server's seed, with nobody else in it. */
  startRunAt?(seed: number): void;
  /** On the client: moves the run on one fixed step (does nothing unless a run is on). */
  stepRun?(dt: number): void;
  /** On the client: how far into the run it is, in milliseconds. */
  readonly runMs?: number;
  /** On the client, for a game whose players have a place of their own: puts this person's player where the server has seated them (read from its snapshot), right after `startRunAt`. */
  seat?(userId: string, x: number): void;
  /** On the client: this person's own player, to report to the server. */
  localReport?(userId: string): { alive: boolean; f: Record<string, number> } | null;
  /** Set by whatever records high scores: called once when a run ends, with each real player's score
   * (bots and people who only watched are left out). */
  onRunScores?: (scores: LobbyRunScore[]) => void;
  /** Set by the lobby around a call to `action` or `tap`: how far behind the server the picture the person acted on was, in ms (see `LOBBY_BEHIND_MAX_MS`), 0 otherwise. */
  pressBehindMs?: number;
  /** The direction the person is holding, each -1, 0 or 1. */
  input(userId: string, dx: number, dy: number): void;
  /** A one-off move by name, such as `punch`. Unknown names are ignored. */
  action(userId: string, name: string): void;
  /** Like `input` and `action`, for a press the person's device made `at` ms into run number `run` (its own copy's clock): the game
   * applies it when its own run reaches that moment, instead of when it arrives. Used by a practice lobby, which runs a little behind
   * the device so every press has arrived by the time it is due (see SpinLobby). A press for another run is dropped. */
  inputAt?(userId: string, run: number, at: number, dx: number, dy: number): void;
  actionAt?(userId: string, run: number, at: number, name: string): void;
  tapAt?(userId: string, run: number, at: number, target: number): void;
  /** The person tapped target number `target` on the arena, for games whose play space is the controller
   * (see `taps` in the web view). The lobby only passes a whole number from 0 to LOBBY_TAP_TARGETS_MAX;
   * the game ignores an index it has no target for. Games without tap targets leave this out. */
  tap?(userId: string, target: number, ms?: number): void;
  /** The lobby's idle rule: nobody has pressed anything for a long time. Ends the run that is on, as a time cap would (whoever is still in keeps
   * their score, nobody wins). True if it ended a run; false if no run was on (or the game does not have runs). */
  endIdle?(): boolean;
  /** Moves the game forward by `dtMs` milliseconds. */
  tick(dtMs: number): void;
  /** The game as `viewer` should see it. Most games are the same for everyone and ignore `viewer`; a game
   * with something only one person may see (their own hidden ships) shows each person their own. With no
   * viewer, what a spectator sees. */
  snapshot(viewer?: string): LobbyGameSnapshot;
}

/** What a bot wants to do this tick: the direction it holds (kept until it says otherwise) and any
 * one-off moves. The same things a person sends. */
export interface BotCommand {
  dx?: number;
  dy?: number;
  actions?: string[];
  /** Arena tap targets to tap (for a game whose play space is the controller). */
  taps?: number[];
}

/** One bot's brain: looks at the game as a player would (the snapshot) and decides what to press. Made
 * per bot, so it can remember things between ticks. Bots are meant to be beatable, not perfect. */
export type BotBrain = (snapshot: LobbyGameSnapshot, dtMs: number) => BotCommand;
