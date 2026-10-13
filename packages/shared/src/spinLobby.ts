// The live room lobby: a small server-run game members can play while they wait for a spin (or just
// for fun, without one). One WebSocket per member per room; the server owns the simulation and sends
// a snapshot every tick, the client only sends what the person is pressing. Results are cosmetic -
// nothing here touches a spin's outcome.
//
// A game is a module on the server (services/lobbyGames/) plus a drawing function in the browser
// (web/src/lobbyGames/). To add one: give it an id here, a snapshot type, a server module and a
// renderer.

/** Server ticks per second (and snapshots per second). */
export const LOBBY_TICK_HZ = 15;

/** The games the lobby can run. */
export type LobbyGameId = 'totem' | 'runner';
export const LOBBY_GAME_IDS: readonly LobbyGameId[] = ['totem', 'runner'];

/** What a client sends. Anything else is ignored. */
export type LobbyClientMessage =
  /** The direction the person is holding, each -1, 0 or 1. Sent only when it changes. */
  | { t: 'input'; dx: number; dy: number }
  /** A one-off move the current game understands, such as `punch`. */
  | { t: 'action'; name: string }
  /** Vote (or take the vote back) to leave the lobby and go to the spin. */
  | { t: 'vote'; on: boolean };

/** Longest action name the server accepts. */
export const LOBBY_ACTION_NAME_MAX = 16;

// ---- Totem push-off ------------------------------------------------------------------------------

export type TotemPhase =
  /** Fewer than two players: walk around freely, nobody can fall. */
  | 'lobby'
  /** Everyone is placed on the totem; the round starts when it runs out. */
  | 'countdown'
  | 'playing'
  /** The round has a winner (or a draw); a new one starts soon. */
  | 'over';

export interface TotemPlayer {
  id: string;
  x: number;
  y: number;
  /** On the totem and in the round. False once knocked off, or if they arrived mid-round. */
  alive: boolean;
  /** Rounds won since this person joined the lobby. */
  wins: number;
  /** Milliseconds since this player last punched, capped (for the swing animation). */
  punchAgo: number;
  /** Milliseconds until they can punch again; 0 when ready. */
  cooldown: number;
}

export interface TotemSnapshot {
  id: 'totem';
  phase: TotemPhase;
  /** Radius of the totem in arena units, centred at (0.5, 0.5). Shrinks during a round. */
  radius: number;
  players: TotemPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the round that just ended (`over` only); null for a draw. */
  winnerId: string | null;
}

export const TOTEM_CENTER = 0.5;

// ---- Runner (the offline dinosaur game, everyone on one course) ------------------------------------

/** The track is one screen wide (1.0); a runner stands at this fraction of it. */
export const RUNNER_X = 0.18;

export type RunnerObstacleKind = 'cactus' | 'bird';

/** An obstacle on screen. `x` is how far ahead of the start of the screen it is (0..1 is visible). */
export interface RunnerObstacle {
  x: number;
  kind: RunnerObstacleKind;
}

export interface RunnerPlayer {
  id: string;
  /** Height of the runner's feet above the ground, in lane heights (0 = on the ground). */
  h: number;
  ducking: boolean;
  /** Still running. False once they hit something, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How far they got, in metres: live while running, final once out. */
  meters: number;
}

export interface RunnerSnapshot {
  id: 'runner';
  phase: TotemPhase;
  /** Metres run so far by the course (the furthest runner's distance). */
  meters: number;
  /** Track speed in screens per second. */
  speed: number;
  obstacles: RunnerObstacle[];
  players: RunnerPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

/** The snapshot of whichever game is running. */
export type LobbyGameSnapshot = TotemSnapshot | RunnerSnapshot;

export interface LobbySnapshot {
  t: 'state';
  tick: number;
  game: LobbyGameSnapshot;
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
