// The live room lobby: a small shared arena members can play in while they wait for a spin (or
// just for fun, without one). One WebSocket per member per room; the server owns the simulation and
// sends a snapshot every tick, the client only sends what the person is pressing. Results are
// cosmetic - nothing here touches a spin's outcome.

/** The arena is a unit square; positions are 0..1 on both axes. */
export const LOBBY_ARENA_SIZE = 1;
/** Server ticks per second (and snapshots per second). */
export const LOBBY_TICK_HZ = 15;
/** Distance a player covers per second, in arena units. */
export const LOBBY_PLAYER_SPEED = 0.4;

/** What a client sends. Anything else is ignored. */
export type LobbyClientMessage =
  /** The direction the person is holding, each -1, 0 or 1. Sent only when it changes. */
  | { t: 'input'; dx: number; dy: number }
  /** Vote (or take the vote back) to leave the lobby and go to the spin. */
  | { t: 'vote'; on: boolean };

export interface LobbyPlayer {
  id: string;
  x: number;
  y: number;
}

export interface LobbySnapshot {
  t: 'state';
  tick: number;
  players: LobbyPlayer[];
  /** Members in the lobby who have voted to spin. */
  voters: string[];
  /** Votes it takes: more than half of the members currently in the lobby. */
  needed: number;
  /** A spin is waiting for members, so the vote means something. Without one the lobby just runs. */
  spinWaiting: boolean;
}

/** What the server sends. `started` means the spin has begun: leave the lobby and show it. */
export type LobbyServerMessage = LobbySnapshot | { t: 'started' };

/** Votes needed to start the spin: more than half of the members in the lobby (not the whole room -
 * people who are not on QueueUp, or cannot join the session, do not count). */
export function lobbyVotesNeeded(present: number): number {
  return Math.floor(Math.max(1, present) / 2) + 1;
}

/** Clamps a direction component from a client to -1, 0 or 1. */
export function clampDirection(n: unknown): -1 | 0 | 1 {
  return n === 1 || n === -1 ? n : 0;
}
