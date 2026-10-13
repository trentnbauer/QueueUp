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
export type LobbyGameId = 'runner' | 'flappy';
export const LOBBY_GAME_IDS: readonly LobbyGameId[] = ['runner', 'flappy'];

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

// ---- Rounds --------------------------------------------------------------------------------------

/** Where a round-based lobby game is: waiting for players, counting down, running, or showing the result. */
export type LobbyRoundPhase =
  /** Nobody is playing yet. */
  | 'lobby'
  /** Everyone is placed at the start; the round starts when it runs out. */
  | 'countdown'
  | 'playing'
  /** The round has a winner (or a draw); a new one starts soon. */
  | 'over';

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
  phase: LobbyRoundPhase;
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

// ---- Flappy (flap through the gaps, everyone on one course) ----------------------------------------

/** Where a bird sits across the screen. */
export const FLAPPY_X = 0.22;
/** How tall the gap in each pipe is, as a fraction of the screen height. */
export const FLAPPY_GAP = 0.3;
export const FLAPPY_PIPE_WIDTH = 0.08;
export const FLAPPY_BIRD_RADIUS = 0.03;

/** A pipe on screen: `x` is how far ahead of the screen's left edge it is, `gap` the height (0 = floor,
 * 1 = ceiling) of the middle of the opening. */
export interface FlappyPipe {
  x: number;
  gap: number;
}

export interface FlappyPlayer {
  id: string;
  /** Height of the bird, 0 (floor) to 1 (ceiling). */
  y: number;
  /** Still flying. False once they hit something, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How far they got, in metres: live while flying, final once out. */
  meters: number;
}

export interface FlappySnapshot {
  id: 'flappy';
  phase: LobbyRoundPhase;
  meters: number;
  /** Course speed in screens per second. */
  speed: number;
  pipes: FlappyPipe[];
  players: FlappyPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

/** The snapshot of whichever game is running. */
export type LobbyGameSnapshot = RunnerSnapshot | FlappySnapshot;

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
