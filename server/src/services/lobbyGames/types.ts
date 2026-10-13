import type { LobbyGameId, LobbyGameSnapshot } from '@queueup/shared';

/** A mini game the room lobby can run. Pure rules and state - no sockets, timers or database - so a
 * game is easy to test and to add: give it an id (packages/shared/src/spinLobby.ts), a snapshot type,
 * this interface, an entry in `createLobbyGame` (index.ts) and a renderer in the web app
 * (web/src/lobbyGames/). The server drives `tick` at LOBBY_TICK_HZ and sends `snapshot()` to everyone.
 * Games are cosmetic: nothing here may touch a spin. */
export interface LobbyGame {
  readonly id: LobbyGameId;
  /** A member arrived (the lobby calls this once per person, not once per tab). */
  join(userId: string): void;
  leave(userId: string): void;
  /** The direction the person is holding, each -1, 0 or 1. */
  input(userId: string, dx: number, dy: number): void;
  /** A one-off move by name, such as `punch`. Unknown names are ignored. */
  action(userId: string, name: string): void;
  /** Moves the game forward by `dtMs` milliseconds. */
  tick(dtMs: number): void;
  snapshot(): LobbyGameSnapshot;
}
