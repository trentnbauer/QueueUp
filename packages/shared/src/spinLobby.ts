// The live room lobby: a small server-run game members can play while they wait for a spin (or just
// for fun, without one). One WebSocket per member per room; the server owns the simulation and sends
// a snapshot every tick, the client only sends what the person is pressing. Results are cosmetic -
// nothing here touches a spin's outcome.
//
// A game is a rules class (packages/shared/src/lobbyGames/) plus a drawing function in the browser
// (web/src/lobbyGames/). To add one: give it an id here, a snapshot type, a rules class and a
// renderer.

/** Server ticks per second (and snapshots per second). */
export const LOBBY_TICK_HZ = 15;

/** The games the lobby can run. */
export type LobbyGameId = 'runner' | 'flappy' | 'dodge' | 'rope' | 'redlight' | 'coins' | 'battleships' | 'race' | 'whack' | 'draw';
export const LOBBY_GAME_IDS: readonly LobbyGameId[] = ['runner', 'flappy', 'dodge', 'rope', 'redlight', 'coins', 'battleships', 'race', 'whack', 'draw'];

/** What a client sends. Anything else is ignored. */
export type LobbyClientMessage =
  /** The direction the person is holding, each -1, 0 or 1. Sent only when it changes. */
  | { t: 'input'; dx: number; dy: number }
  /** A one-off move the current game understands, such as `punch`. */
  | { t: 'action'; name: string }
  /** The person tapped one of the game's tap targets on the arena (see `LOBBY_TAP_TARGETS_MAX`). `target`
   * is the target's index, never a position, so a client cannot claim a tap no target would give. */
  | { t: 'tap'; target: number }
  /** Where a person's own player is, for a game that runs each player on their own device (see
   * `LobbyGame.clientSim`): `run` is the run it belongs to, `alive` is false once they are out, and `f`
   * is the game's own fields (a height, a speed). Sent about 20 times a second while a run is on. */
  | { t: 'report'; run: number; alive: boolean; f: Record<string, number> }
  /** Asks the server for its clock (answered with `pong`), so a client can line its own clock up. */
  | { t: 'ping'; c: number }
  /** Vote (or take the vote back) to leave the lobby and go to the spin. */
  | { t: 'vote'; on: boolean };

/** Longest action name the server accepts. */
export const LOBBY_ACTION_NAME_MAX = 16;

/** The most fields one `report` may carry; the server drops a report with more. */
export const LOBBY_REPORT_FIELDS_MAX = 8;

/** The most tap targets a game can have on the arena; the server drops a tap with a higher index. A game
 * checks the index against its own count too. */
export const LOBBY_TAP_TARGETS_MAX = 128;

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
  /** Which game the run was, since the lobby can change game between runs. */
  game: LobbyGameId;
}

/** One person's score from a finished run: metres, coins, swings or points, whatever the game counts. */
export interface LobbyRunScore {
  userId: string;
  score: number;
}

/** What every round-based game adds to its snapshot, so the lobby can show the run number, the last
 * few results and the best run since people started playing. */
export interface RoundSummary {
  /** Which run this is (1 for the first since the lobby opened). */
  run: number;
  /** The last 10 finished runs, oldest first. */
  history: RunResult[];
  /** The furthest run so far in this game, or null before one has finished. */
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

// ---- Battleships (one shared board; everyone hides their own ships on it and fires at the rest) -----

/** The board is this many squares each way (8 x 8 = 64, so squares are tap targets 0 to 63). */
export const BATTLESHIPS_SIZE = 8;

/** What a square shows. A square nobody has shot shows nothing: no ship is given away. */
export const SQUARE_UNKNOWN = 0;
export const SQUARE_MISS = 1;
export const SQUARE_HIT = 2;
/** Part of a ship that has been sunk. */
export const SQUARE_SUNK = 3;

export interface BattleshipsPlayer {
  id: string;
  /** Still in: in the round, and with a ship afloat. False once their fleet is sunk. */
  alive: boolean;
  /** Was in the round when it started (someone who arrived part way through only watches). */
  inRound: boolean;
  /** Rounds won since this person joined the lobby. */
  wins: number;
  /** Points this round: a hit is 1, and the shot that sinks a ship is 1 more. */
  meters: number;
  /** Shots taken, and how many of them hit. */
  shots: number;
  hits: number;
  /** Milliseconds until they can shoot again (0 when they can). */
  cooldownMs: number;
  /** How many squares of their ships are still afloat (everyone can see this). */
  afloat: number;
  /** Their ships by length, and whether each is sunk (everyone can see this); where they are is not shown. */
  fleet: { len: number; sunk: boolean }[];
}

/** Sent to one person (see `LobbyGame.snapshot(viewer)`): the same for everyone except for `mine`, which is
 * only ever sent to the person it belongs to. */
export interface BattleshipsSnapshot extends RoundSummary {
  id: 'battleships';
  phase: LobbyRoundPhase;
  /** The most points anyone has so far. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Milliseconds left in the round while `playing`. */
  roundLeftMs: number;
  players: BattleshipsPlayer[];
  /** Each square of the one board, row by row: SQUARE_UNKNOWN, SQUARE_MISS, SQUARE_HIT or SQUARE_SUNK. */
  cells: number[];
  /** Who shot each square: the index into `players`, or -1 for a square nobody has shot. */
  by: number[];
  /** Whose ship each sunk square was: the index into `players`, or -1 (a square not part of a sunk ship). */
  owner: number[];
  /** This person's own ships, the squares of each, or null for someone who is not in the round. Only they are sent it. */
  mine: number[][] | null;
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the round that just ended (`over` only); null when nobody did. */
  winnerId: string | null;
}

// ---- Obstacle race (steer clear; a hit slows you and you slide down the screen) --------------------

/** The line a driver at full speed sits on, as a fraction of the height from the top. Nobody gets ahead of it. */
export const RACE_FRONT_Y = 0.5;
/** A driver whose middle passes this (the bottom of the screen) has fallen off and is out. */
export const RACE_OUT_Y = 1;
export const RACE_CAR_WIDTH = 0.055;
export const RACE_CAR_HEIGHT = 0.09;
/** The kerb along each side of the track; drivers stay inside it. */
export const RACE_KERB = 0.035;

/** What is on the track. A cone is small, an oil slick wide and flat, a rock big; a bigger one slows you more. */
export type RaceObstacleKind = 'cone' | 'oil' | 'rock';

/** An obstacle: `x` is its middle across the width (0..1), `y` its middle down from the top. */
export interface RaceObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: RaceObstacleKind;
  /** Which obstacle this is (counts up from 1 each run); stays the same as it scrolls. */
  n: number;
}

export interface RacePlayer {
  id: string;
  /** Where they are across the track (0..1). */
  x: number;
  /** How far down the screen they are: `RACE_FRONT_Y` at full speed, further down while slowed. */
  y: number;
  /** The direction they are steering: -1, 0 or 1. */
  dir: number;
  /** True for a moment after a hit (for a spin-out wobble). */
  hit: boolean;
  /** Still on the screen. False once they slide off the bottom, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How far they have driven, in metres: live while racing, final once out. */
  meters: number;
}

export interface RaceSnapshot extends RoundSummary {
  id: 'race';
  phase: LobbyRoundPhase;
  meters: number;
  /** How fast the track scrolls, in screens per second. */
  speed: number;
  obstacles: RaceObstacle[];
  players: RacePlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

// ---- Whack-a-mole (one shared 3 x 3 grid of holes; tap a hole while a mole is up) ---------------------

/** The grid is this many holes each way (3 x 3 = 9, so holes are tap targets 0 to 8, row by row). */
export const WHACK_COLS = 3;
export const WHACK_HOLES = WHACK_COLS * WHACK_COLS;

/** What a hole shows: nothing, a mole (tap it), a bomb (do not), or a mole or bomb that was just whacked. */
export type WhackHoleKind = 'empty' | 'mole' | 'bomb' | 'whacked';

export interface WhackHole {
  kind: WhackHoleKind;
  /** Which mole or bomb this is (counts up from 1 each round); stays the same while it is up. 0 when empty. */
  n: number;
  /** Milliseconds it stays up for in all (`mole` or `bomb`), to work out how far it has risen; 0 otherwise. */
  upMs: number;
  /** Who whacked it, as an index into `players` (`whacked` only); -1 otherwise. */
  by: number;
  /** For `whacked`: whether it was a bomb. */
  bomb: boolean;
}

export interface WhackPlayer {
  id: string;
  /** Playing this round. False if they arrived mid-round (they watch and play from the next one). */
  alive: boolean;
  /** Rounds won since this person joined the lobby. */
  wins: number;
  /** Points this round. */
  meters: number;
}

export interface WhackSnapshot extends RoundSummary {
  id: 'whack';
  phase: LobbyRoundPhase;
  /** The most points anyone has so far. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Milliseconds left in the round while `playing`. */
  roundLeftMs: number;
  /** The nine holes of the one shared grid, row by row. */
  holes: WhackHole[];
  players: WhackPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the round that just ended (`over` only); null when nobody did (a solo round, or a tie). */
  winnerId: string | null;
}

// ---- Quick draw (one shared screen; wait for GO, then tap first) -----------------------------------

/** Points a player needs to win a run. */
export const DRAW_POINTS_TO_WIN = 3;

/** Where a duel round is: waiting for GO (tapping now is a false start), GO has flashed, or the result is showing. */
export type DrawStage = 'wait' | 'go' | 'result';

/** How a player stands in the current duel round. */
export type DrawPlayerState = 'ready' | 'false' | 'late' | 'won';

export interface DrawPlayer {
  id: string;
  /** Playing this run. False if they arrived mid-run (they watch and play from the next one). */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Points this run (first to `DRAW_POINTS_TO_WIN`). */
  meters: number;
  /** `false`: tapped before GO and is out of this round. `late`: someone else was first. */
  state: DrawPlayerState;
}

export interface DrawSnapshot extends RoundSummary {
  id: 'draw';
  phase: LobbyRoundPhase;
  /** The most points anyone has so far. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Milliseconds left in the run (a time limit) while `playing`. */
  roundLeftMs: number;
  /** Which duel round of the run this is (from 1). */
  duel: number;
  stage: DrawStage;
  /** Milliseconds since GO flashed (`go` and `result`); 0 while waiting. The wait before GO is never sent. */
  sinceGoMs: number;
  /** Who won the duel round (`result` only), and how many milliseconds after GO their tap came in; null when nobody did. */
  duelWinnerId: string | null;
  reactMs: number;
  players: DrawPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a draw). */
  winnerId: string | null;
}

/** The snapshot of whichever game is running. */
export type LobbyGameSnapshot = RunnerSnapshot | FlappySnapshot | DodgeSnapshot | RopeSnapshot | RedLightSnapshot | CoinsSnapshot | BattleshipsSnapshot | RaceSnapshot | WhackSnapshot | DrawSnapshot;

/** What a client needs to run its own player on a course the server decided: which run, the seed that
 * makes the course, and how long until the run starts (negative once it has, by how far in). */
export interface LobbySim {
  run: number;
  seed: number;
  startInMs: number;
}

export interface LobbySnapshot {
  t: 'state';
  tick: number;
  game: LobbyGameSnapshot;
  /** Present when the game runs each player on their own device: see `LobbySim`. */
  sim?: LobbySim;
  /** The server's clock (ms since 1970) when this was sent, to turn `sim.startInMs` into a time. */
  clock?: number;
  /** Members in the lobby who have voted to spin. */
  voters: string[];
  /** Votes it takes: more than half of the members currently in the lobby. */
  needed: number;
  /** A spin is waiting for members, so the vote means something. Without one the lobby just runs. */
  spinWaiting: boolean;
}

/** What the server sends. `started` means the spin has begun: leave the lobby and show it. */
export type LobbyServerMessage = LobbySnapshot | { t: 'started' } | { t: 'pong'; c: number; s: number };

/** Votes needed to start the spin: more than half of the members in the lobby (not the whole room -
 * people who are not on QueueUp, or cannot join the session, do not count). */
export function lobbyVotesNeeded(present: number): number {
  return Math.floor(Math.max(1, present) / 2) + 1;
}

/** Clamps a direction component from a client to -1, 0 or 1. */
export function clampDirection(n: unknown): -1 | 0 | 1 {
  return n === 1 || n === -1 ? n : 0;
}
