import type { LobbyGameId, LobbyGameSnapshot } from '../spinLobby.js';

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
  /** The direction the person is holding, each -1, 0 or 1. */
  input(userId: string, dx: number, dy: number): void;
  /** A one-off move by name, such as `punch`. Unknown names are ignored. */
  action(userId: string, name: string): void;
  /** The person tapped target number `target` on the arena, for games whose play space is the controller
   * (see `taps` in the web view). The lobby only passes a whole number from 0 to LOBBY_TAP_TARGETS_MAX;
   * the game ignores an index it has no target for. Games without tap targets leave this out. */
  tap?(userId: string, target: number): void;
  /** Moves the game forward by `dtMs` milliseconds. */
  tick(dtMs: number): void;
  snapshot(): LobbyGameSnapshot;
}

/** What a bot wants to do this tick: the direction it holds (kept until it says otherwise) and any
 * one-off moves. The same things a person sends. */
export interface BotCommand {
  dx?: number;
  dy?: number;
  actions?: string[];
}

/** One bot's brain: looks at the game as a player would (the snapshot) and decides what to press. Made
 * per bot, so it can remember things between ticks. Bots are meant to be beatable, not perfect. */
export type BotBrain = (snapshot: LobbyGameSnapshot, dtMs: number) => BotCommand;
