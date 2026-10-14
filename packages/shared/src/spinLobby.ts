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
export type LobbyGameId = 'runner' | 'flappy' | 'dodge' | 'rope' | 'redlight' | 'coins';
export const LOBBY_GAME_IDS: readonly LobbyGameId[] = ['runner', 'flappy', 'dodge', 'rope', 'redlight', 'coins'];

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

/** How one finished run went, for the lobby's win chart. `id` is whoever got furthest (the winner, or
 * the lone player in a solo run); `winnerId` is set only when someone won. */
export interface RunResult {
  id: string;
  winnerId: string | null;
  meters: number;
}

/** What every round-based game adds to its snapshot, so the lobby can show the run number, the last
 * few results and the best run since people started playing. */
export interface RoundSummary {
  /** Which run this is (1 for the first since the lobby opened). */
  run: number;
  /** The last 10 finished runs, oldest first. */
  history: RunResult[];
  /** The furthest run so far, or null before one has finished. */
  best: RunResult | null;
}

/** How many finished runs the snapshot keeps. */
export const LOBBY_HISTORY_LENGTH = 10;

// ---- Runner (the offline dinosaur game, everyone on one course) ------------------------------------

/** The track is one screen wide (1.0); a runner stands at this fraction of it. */
export const RUNNER_X = 0.18;

/** A cactus is jumped, a bird is ducked, and a log is wide: it takes a held jump to clear. */
export type RunnerObstacleKind = 'cactus' | 'bird' | 'log';

/** An obstacle on screen. `x` is how far ahead of the start of the screen it is (0..1 is visible). */
export interface RunnerObstacle {
  x: number;
  kind: RunnerObstacleKind;
  /** Which obstacle this is (counts up from 1 each run): stays the same as it scrolls, so it can be
   * drawn the same way every frame. */
  n: number;
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

export interface RunnerSnapshot extends RoundSummary {
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
  /** Which pipe this is (counts up from 1 each run); stays the same as it scrolls. */
  n: number;
}

export interface FlappyPlayer {
  id: string;
  /** Height of the bird, 0 (floor) to 1 (ceiling). */
  y: number;
  /** Vertical speed in screens per second (up is positive), for tilting the wing. */
  vy: number;
  /** Still flying. False once they hit something, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How far they got, in metres: live while flying, final once out. */
  meters: number;
}

export interface FlappySnapshot extends RoundSummary {
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

// ---- Dodge (blocks fall, slide left and right to stay clear) ---------------------------------------

/** Where the players stand, as a fraction of the height from the top. */
export const DODGE_PLAYER_Y = 0.92;
export const DODGE_PLAYER_WIDTH = 0.06;
export const DODGE_BLOCK_HEIGHT = 0.06;

/** A falling block: `x` is its middle across the width (0..1), `y` its middle down from the top. */
export interface DodgeBlock {
  x: number;
  y: number;
  w: number;
  /** Which block this is (counts up from 1 each run); stays the same as it falls. */
  n: number;
}

export interface DodgePlayer {
  id: string;
  /** Where they stand across the width (0..1). */
  x: number;
  /** The direction they are moving: -1, 0 or 1 (for a motion trail). */
  dir: number;
  /** Still standing. False once a block hits them, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How long they lasted, in metres of falling: live while standing, final once out. */
  meters: number;
}

export interface DodgeSnapshot extends RoundSummary {
  id: 'dodge';
  phase: LobbyRoundPhase;
  meters: number;
  /** How fast blocks fall, in screens per second. */
  speed: number;
  blocks: DodgeBlock[];
  players: DodgePlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

/** The snapshot of whichever game is running. */
// ---- Jump rope (a rope swings round, everyone jumps it together) -----------------------------------

/** How high a jumper has to be, as a fraction of the screen height, for the rope to pass under them. */
export const ROPE_CLEAR_HEIGHT = 0.05;
export const ROPE_PLAYER_RADIUS = 0.03;

export interface RopePlayer {
  id: string;
  /** Where they stand across the width (0..1); fixed for the run. */
  x: number;
  /** How high off the floor they are, as a fraction of the screen height (0 = standing). */
  y: number;
  /** Still jumping. False once the rope catches them, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Swings of the rope they have jumped: live while jumping, final once out. */
  meters: number;
}

export interface RopeSnapshot extends RoundSummary {
  id: 'rope';
  phase: LobbyRoundPhase;
  /** Swings the rope has completed this run (shown as the score). */
  meters: number;
  /** Where the rope is in its swing, 0..1: 0 is brushing the floor, 0.5 is overhead. */
  angle: number;
  /** Seconds the current swing takes. */
  period: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  players: RopePlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

// ---- Red light, green light (run while it is green, freeze when it is red) -------------------------

/** What the light is doing. `warn` is green with a short flash: it is about to turn red. */
export type RedLightState = 'green' | 'warn' | 'red';

export interface RedLightPlayer {
  id: string;
  /** How far along the track they are, 0 (start) to 1 (the finish line). */
  x: number;
  /** Holding the run button right now (for the running animation). */
  running: boolean;
  /** Still in. False once caught moving on red, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How far they got, in metres (one screen is 20 m): live while in, final once out. */
  meters: number;
}

export interface RedLightSnapshot extends RoundSummary {
  id: 'redlight';
  phase: LobbyRoundPhase;
  /** How far the leader has got, in metres. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  light: RedLightState;
  players: RedLightPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

// ---- Catch the coins (coins and bombs fall; slide left and right to catch the coins) ----------------

/** Where the catchers stand, as a fraction of the height from the top. */
export const COINS_PLAYER_Y = 0.92;
export const COINS_PLAYER_WIDTH = 0.1;
/** Coins and bombs are drawn (and caught) as squares this big, as a fraction of the width. */
export const COINS_ITEM_SIZE = 0.05;

export type CoinKind = 'coin' | 'bomb';

/** A falling coin or bomb: `x` is its middle across the width (0..1), `y` its middle down from the top. */
export interface CoinItem {
  x: number;
  y: number;
  kind: CoinKind;
  /** Which item this is (counts up from 1 each run); stays the same as it falls. */
  n: number;
}

export interface CoinsPlayer {
  id: string;
  /** Where they stand across the width (0..1). */
  x: number;
  /** The direction they are moving: -1, 0 or 1 (for a motion trail). */
  dir: number;
  /** Stunned by a bomb, so they cannot move for a moment. */
  stunned: boolean;
  /** Playing this round. False if they arrived mid-round (they watch and play from the next one). */
  alive: boolean;
  /** Rounds won since this person joined the lobby. */
  wins: number;
  /** Coins caught this round. */
  meters: number;
}

export interface CoinsSnapshot extends RoundSummary {
  id: 'coins';
  phase: LobbyRoundPhase;
  /** The most coins anyone has caught so far. */
  meters: number;
  /** How fast things fall, in screens per second. */
  speed: number;
  /** Milliseconds left in the round while `playing`. */
  roundLeftMs: number;
  items: CoinItem[];
  players: CoinsPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the round that just ended (`over` only); null when nobody did (a solo round, or a tie). */
  winnerId: string | null;
}

/** The snapshot of whichever game is running. */
export type LobbyGameSnapshot = RunnerSnapshot | FlappySnapshot | DodgeSnapshot | RopeSnapshot | RedLightSnapshot | CoinsSnapshot;

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
