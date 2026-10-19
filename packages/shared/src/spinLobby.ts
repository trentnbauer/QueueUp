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
export type LobbyGameId = 'runner' | 'flappy' | 'dodge' | 'rope' | 'coins' | 'battleships' | 'race' | 'whack' | 'draw' | 'tilt' | 'stacker' | 'sumo' | 'asteroids' | 'memory' | 'words' | 'lava' | 'snake' | 'gravity' | 'laser' | 'colormatch' | 'potato' | 'anagram' | 'mines' | 'stop' | 'pong' | 'wall' | 'frogger' | 'fishing';
export const LOBBY_GAME_IDS: readonly LobbyGameId[] = ['runner', 'flappy', 'dodge', 'rope', 'coins', 'battleships', 'race', 'whack', 'draw', 'tilt', 'stacker', 'sumo', 'asteroids', 'memory', 'words', 'lava', 'snake', 'gravity', 'laser', 'colormatch', 'potato', 'anagram', 'mines', 'stop', 'pong', 'wall', 'frogger', 'fishing'];

/** What a client sends. Anything else is ignored. */
export type LobbyClientMessage =
  /** The direction the person is holding, each -1, 0 or 1. Sent only when it changes. In a practice run of a game their own device
   * also works out, `run` and `at` say which run and how far into it (ms, on the device's copy) the press happened, so the server can
   * apply it at that same moment instead of whenever it arrives (see `SpinLobby`'s practice delay). */
  | { t: 'input'; dx: number; dy: number; run?: number; at?: number }
  /** A one-off move the current game understands, such as `punch`. `run` and `at` as for `input`. */
  | { t: 'action'; name: string; run?: number; at?: number }
  /** The person tapped one of the game's tap targets on the arena (see `LOBBY_TAP_TARGETS_MAX`). `target`
   * is the target's index, never a position, so a client cannot claim a tap no target would give. */
  | { t: 'tap'; target: number; /** The person's own reaction time in ms, measured on their device (Quick draw only). */ ms?: number }
  /** Where a person's own player is, for a game that runs each player on their own device (see
   * `LobbyGame.clientSim`): `run` is the run it belongs to, `alive` is false once they are out, and `f`
   * is the game's own fields (a height, a speed). Sent about 20 times a second while a run is on. */
  | { t: 'report'; run: number; alive: boolean; f: Record<string, number> }
  /** Asks the server for its clock (answered with `pong`), so a client can line its own clock up. */
  | { t: 'ping'; c: number }
  /** Vote (or take the vote back) to leave the lobby and go to the spin. */
  | { t: 'vote'; on: boolean }
  /** Turn the time limit (every run capped at `LOBBY_WAITING_ROOM_LIMIT_S` seconds) on, or off for runs that go on until they are beaten.
   * For everyone in the lobby; ignored in a practice lobby (never capped) and while a spin waits (always capped). */
  | { t: 'timeLimit'; on: boolean };

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
  /** How long a run can last in all, in milliseconds, or 0 when it goes on until it is beaten (a time bar
   * has nothing to show then). A spin's waiting room caps every run at `LOBBY_WAITING_ROOM_LIMIT_S`. */
  limitMs: number;
}

/** A run in a spin's waiting room ends after this many seconds, whatever the game, so the waiting room keeps moving. */
export const LOBBY_WAITING_ROOM_LIMIT_S = 30;
/** Lives each player has in a game that is a fixed-length round by design (Coins, Whack-a-mole, Match) when nothing caps the run: it then goes
 * on, getting harder, until they have lost them all. */
export const ENDLESS_LIVES = 3;

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
  /** How wide it is, in screens: a cactus is usually 0.1 (or 0.05 when two skinny ones stand together), a log
   * 0.3, a bird 0.06 or, when it is a long one, 0.18 to 0.32. */
  w: number;
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
export const DODGE_BLOCK_HEIGHT = 0.09;

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
  /** Lives left in an endless run (no time limit), or null in a timed round, which has none. */
  lives: number | null;
  /** Where they stand across the width (0..1). */
  x: number;
  /** The direction they are moving: -1, 0 or 1 (for a motion trail). */
  dir: number;
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

/** A stretch of pit lane: a strip of the track, from `x0` to `x1` across (fractions of the width, at the kerb, against it or
 * anywhere between), that slows any driver whose middle is in it. `y` is its top edge down from the top and `h` its length. */
export interface RacePit {
  x0: number;
  x1: number;
  y: number;
  h: number;
  /** Which stretch this is (counts up from 1 each run); stays the same as it scrolls. */
  n: number;
}

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
  /** Pit lanes along the sides, which slow a driver down while they are in one. */
  pits: RacePit[];
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

/** What a hole shows: nothing, a mole (tap it) or a bomb (do not). */
export type WhackHoleKind = 'empty' | 'mole' | 'bomb';

export interface WhackHole {
  kind: WhackHoleKind;
  /** Which mole or bomb this is (counts up from 1 each round); stays the same while it is up. 0 when empty. */
  n: number;
  /** Milliseconds it stays up for in all (`mole` or `bomb`), to work out how far it has risen; 0 otherwise. */
  upMs: number;
  /** Everyone who has tapped it while it has been up, as indexes into `players`, in the order they got it. It stays up
   * for its full time, so more can follow. */
  by: number[];
}

export interface WhackPlayer {
  id: string;
  /** Lives left in an endless run (no time limit), or null in a timed round, which has none. */
  lives: number | null;
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

// ---- Tilt (everyone has a ball on one beam, and the balls tip it; score the targets, keep yours on) -----------------

/** A target on the beam: `x` is its middle along the beam (0..1). The first ball to reach it scores. */
export interface TiltTarget {
  x: number;
  /** Which target this is (counts up from 1 each run); stays the same while it lasts. */
  n: number;
  /** Milliseconds it has left before it goes away. */
  leftMs: number;
}

export interface TiltPlayer {
  id: string;
  /** Their ball is still on the beam. False once it has rolled off, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Targets this person scored this run (they pushed last when the ball reached it). */
  meters: number;
  /** The direction they are pushing: -1, 0 or 1. */
  dir: number;
  /** Where their own ball is along the beam (0..1; below 0 or above 1 it has rolled off) and how fast it is going. */
  x: number;
  v: number;
  /** Their ball rolled off this run (so they are out), as opposed to never having been in it. */
  fell: boolean;
}

export interface TiltSnapshot extends RoundSummary {
  id: 'tilt';
  phase: LobbyRoundPhase;
  /** The most targets anyone has scored so far. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Milliseconds left in the run (a time limit) while `playing`. */
  roundLeftMs: number;
  /** The beam's lean, -1 to 1 (left to right): toward where the balls are on average, plus the wobble. It pulls every ball downhill. */
  tilt: number;
  targets: TiltTarget[];
  players: TiltPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a tie). */
  winnerId: string | null;
}

// ---- Stacker (one shared tower and one light; players race to lock rows in) -------------------------

/** The tower is this many squares wide. It has no top: it goes on for as long as people keep locking rows in. */
export const STACKER_COLS = 9;
/** How many rows tall the view of it is. The view scrolls up as the tower grows. */
export const STACKER_ROWS = 12;
/** The view keeps the current row this many rows from the bottom once the tower is that high, so there is room
 * above it for the rows still to come. */
export const STACKER_KEEP_ROWS = 8;

/** A row someone has locked in: the squares that were the target (`start` to `start + w - 1`) and who locked it. */
export interface StackerLocked {
  start: number;
  w: number;
  /** Index into `players`. */
  by: number;
}

export interface StackerPlayer {
  id: string;
  /** Still in the run: false once they pressed and missed, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Rows this person has locked in. */
  meters: number;
}

export interface StackerSnapshot extends RoundSummary {
  id: 'stacker';
  phase: LobbyRoundPhase;
  /** The most rows anyone has locked so far. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Milliseconds left in the run (a time limit) while `playing`. */
  roundLeftMs: number;
  /** The rows locked in that are in view, bottom first: only the last `STACKER_KEEP_ROWS` once the tower is
   * taller than that. The current row is the next one up. */
  locked: StackerLocked[];
  /** How many rows are below the first of `locked`, so the row in view at the bottom is row number `first + 1`. */
  first: number;
  /** The target squares of the current row. */
  target: { start: number; w: number } | null;
  /** The light's place along the row, 0 to `STACKER_COLS` (the square it is over is the whole part). */
  light: number;
  players: StackerPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a tie). */
  winnerId: string | null;
}

// ---- Sumo ledge (everyone on one platform that shrinks; shove the others off) ---------------------

export interface SumoPlayer {
  id: string;
  /** Where they stand along the platform's line (0..1; off the platform and they are out). */
  x: number;
  /** The way they face, -1 (left) or 1 (right): the way a shove goes. */
  face: number;
  /** Still on the platform. False once they fall off, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Seconds they stayed on: live while on, final once they fall. */
  meters: number;
  /** Milliseconds until they can shove again (0 when they can). */
  cooldownMs: number;
  /** Milliseconds left of their shove showing (for the drawing). */
  shoveMs: number;
}

export interface SumoSnapshot extends RoundSummary {
  id: 'sumo';
  phase: LobbyRoundPhase;
  /** Seconds the run has lasted. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** The platform's two ends along the line (0..1); they close in as the run goes on. */
  platform: { l: number; r: number };
  players: SumoPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, a draw, or time up). */
  winnerId: string | null;
}

// ---- Asteroid defence (one sky; every player has a turret along the bottom and shoots what falls) ---

/** How high up the screen the turrets sit (their middle, as a fraction of the height from the top). */
export const ASTEROIDS_TURRET_Y = 0.93;
export const ASTEROIDS_TURRET_R = 0.03;
/** The furthest a gun swings from straight up, in radians. */
export const ASTEROIDS_MAX_ANGLE = 1.2;

export interface Asteroid {
  x: number;
  y: number;
  /** Speed across and down, in screens a second. */
  vx: number;
  vy: number;
  /** Its size (radius, in screens). */
  r: number;
  /** Hits left before it breaks. */
  hp: number;
  /** Which asteroid this is (counts up from 1 each run); stays the same as it falls. */
  n: number;
}

export interface AsteroidShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Who fired it: an index into `players`. */
  by: number;
}

export interface AsteroidsPlayer {
  id: string;
  /** Where their turret is along the bottom (0..1): the same for everyone for the whole run. */
  x: number;
  /** Which way the gun points, in radians from straight up (negative is left). */
  angle: number;
  /** Still in: false once an asteroid hits their turret, or if they arrived mid-run. */
  alive: boolean;
  /** Was in the run when it started: has a turret (a wreck once hit). Someone who arrived part way through only watches. */
  inRun: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Asteroids they have destroyed this run. */
  meters: number;
}

export interface AsteroidsSnapshot extends RoundSummary {
  id: 'asteroids';
  phase: LobbyRoundPhase;
  /** The most asteroids anyone has destroyed so far. */
  meters: number;
  /** Always 0: the sky does not scroll (every snapshot carries a course speed). */
  speed: number;
  asteroids: Asteroid[];
  shots: AsteroidShot[];
  players: AsteroidsPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or everyone hit together). */
  winnerId: string | null;
}

// ---- Memory pattern (one board of four panels; watch the pattern, then tap it back) -----------------

/** The board has this many coloured panels (2 x 2, so panels are tap targets 0 to 3: top left, top right,
 * bottom left, bottom right). */
export const MEMORY_PANELS = 4;

/** Where a round is: the pattern is being shown, players are tapping it back, or a short pause before the next. */
export type MemoryStage = 'show' | 'input' | 'between';

export interface MemoryPlayer {
  id: string;
  /** Still in: false once they tap a wrong panel or run out of time, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Rounds they got through: live while in, final once out. */
  meters: number;
  /** How many panels of this round's pattern they have tapped correctly so far (how many, never which). */
  progress: number;
  /** They have tapped this round's whole pattern. */
  done: boolean;
}

export interface MemorySnapshot extends RoundSummary {
  id: 'memory';
  phase: LobbyRoundPhase;
  /** Rounds fully played so far (the longest pattern everyone left in got right). */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  stage: MemoryStage;
  /** How long this round's pattern is (it is one longer every round). Only the length is ever sent while it is
   * being tapped back, never the pattern itself. */
  length: number;
  /** The panel lit right now while the pattern is being shown, or -1 for none. */
  lit: number;
  /** Milliseconds left to tap the pattern back (`input` only), and how long that round allows in all. */
  inputLeftMs: number;
  inputTotalMs: number;
  players: MemoryPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or everyone out together). */
  winnerId: string | null;
}

// ---- Words (everyone guesses the same four-letter word; each person sees their own board) ------------

export const WORDS_LENGTH = 4;
export const WORDS_GUESSES = 5;
/** Tap targets 0 to 25 are the letters a to z; these two follow. */
export const WORDS_ENTER = 26;
export const WORDS_BACKSPACE = 27;
export const WORDS_TARGETS = 28;

/** How a guessed letter scored: not in the word, in it but elsewhere, or in the right place. */
export const WORD_ABSENT = 0;
export const WORD_PRESENT = 1;
export const WORD_CORRECT = 2;

export interface WordsPlayer {
  id: string;
  /** In the run: false only if they arrived part way through (they watch and play from the next one). */
  alive: boolean;
  /** Runs won since this person joined the lobby (everyone who guessed the word counts as a winner). */
  wins: number;
  /** Points this run: more for fewer guesses and a faster solve; 0 until the word is solved. */
  meters: number;
  /** How many guesses they have made. */
  guesses: number;
  /** They found the word. */
  solved: boolean;
  /** Finished: found the word, or used every guess. */
  done: boolean;
  /** How each guess scored, a row per guess: WORD_ABSENT, WORD_PRESENT or WORD_CORRECT for each letter. Never the letters. */
  rows: number[][];
}

/** This person's own board, sent only to them (see `LobbyGame.snapshot(viewer)`). */
export interface WordsMine {
  /** The words they have guessed, in order (the rows of `rows` score them). */
  guesses: string[];
  /** The letters typed for the next guess so far: only for the squares that are not already in `known`. */
  draft: string;
  /** For each of the word's squares, the letter once a guess has had it in the right place, else ''. The next guess
   * fills these in by itself, so only the other squares are typed (and the draft is that long, not the whole word). */
  known: string[];
  /** For each letter a to z, the best it has scored so far: -1 untried, else WORD_ABSENT, WORD_PRESENT or WORD_CORRECT. */
  keys: number[];
}

export interface WordsSnapshot extends RoundSummary {
  id: 'words';
  phase: LobbyRoundPhase;
  /** The most points anyone has so far. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Milliseconds left in the run while `playing`. */
  roundLeftMs: number;
  players: WordsPlayer[];
  /** This person's own guesses, or null for someone who is not in the run. Only they are sent it. */
  mine: WordsMine | null;
  /** The word, once the run is over (never before: it is the secret). */
  answer: string | null;
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only): the person who found the word in the fewest guesses, then the
   * soonest. Null when nobody did, or nobody was first (a solo run, or a dead heat). */
  winnerId: string | null;
}

// ---- Lava rise (jump up the planks faster than the lava climbs) ------------------------------------

/** The lava's surface is this far up from the bottom of the arena, as a fraction of its height. */
export const LAVA_SURFACE = 0.08;
/** A player's radius and a plank's thickness, as fractions of the arena (drawing and landing). */
export const LAVA_PLAYER_R = 0.03;
export const LAVA_PLANK_H = 0.035;
/** The top of the screen is a ceiling this far above the lava's surface: nobody can climb higher than that, so nobody climbs out of sight. */
export const LAVA_CEILING = 0.88;

/** A plank: `z` is the height of its top up from the start of the run, `x` the middle of it across the screen (0..1) and `w` how wide it is.
 * Planks never move; the lava rises past them. */
export interface LavaPlank {
  z: number;
  x: number;
  w: number;
  /** Which plank this is (counts up from 1 each run); stays the same while it lasts. */
  n: number;
}

export interface LavaPlayer {
  id: string;
  /** Where they are across the screen (0..1) and the direction they are holding (-1, 0 or 1). */
  x: number;
  dir: number;
  /** Height of their feet, up from the start of the run (on a plank, the plank's `z`). */
  z: number;
  vy: number;
  /** Standing on a plank. */
  grounded: boolean;
  /** Still climbing. False once they fall in the lava, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How high they got, in metres: live while climbing, final once out. */
  meters: number;
}

export interface LavaSnapshot extends RoundSummary {
  id: 'lava';
  phase: LobbyRoundPhase;
  /** Metres climbed by the lava so far (the run's score while it lasts). */
  meters: number;
  /** How fast the lava is rising, in screens a second. */
  speed: number;
  /** The height of the lava's surface, up from the start of the run. */
  lava: number;
  planks: LavaPlank[];
  players: LavaPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

// ---- Snake arena (one grid, a snake each; last snake alive wins) ---------------------------------

/** The board is this many cells each way. */
export const SNAKE_GRID = 24;

/** A pickup on a cell (`x` across, `y` down, from the top left). */
export interface SnakePickup {
  x: number;
  y: number;
  /** Which pickup this is (counts up from 1 each run); stays the same while it lasts. */
  n: number;
}

export interface SnakePlayer {
  id: string;
  /** Still going. False once they hit something, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How long their snake is: live while going, final once out. */
  meters: number;
  /** The way the head faces: 0 up, 1 right, 2 down, 3 left. */
  heading: number;
  /** The snake's cells, head first, each as `y * grid + x`. Empty once out. */
  cells: number[];
}

export interface SnakeSnapshot extends RoundSummary {
  id: 'snake';
  phase: LobbyRoundPhase;
  /** The longest snake still going. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Cells each way. */
  grid: number;
  /** How many steps this run has taken, so a bot can decide once a step. */
  step: number;
  pickups: SnakePickup[];
  players: SnakePlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (everyone out together). */
  winnerId: string | null;
}

// ---- Gravity flip (run along the floor or ceiling; flip between them to dodge spikes) ------------

/** Where a runner is across the screen. */
export const GRAVITY_X = 0.18;
/** A runner's radius, and how tall a spike is, as fractions of the arena's height (drawing and hits). */
export const GRAVITY_PLAYER_R = 0.035;
export const GRAVITY_SPIKE_H = 0.14;
/** A block floating in the middle of the corridor is this tall (centred on the middle): flying through it is fatal. */
export const GRAVITY_MID_H = 0.26;

/** An obstacle: `x` is how far ahead of the screen's left edge its middle is, `side` where it is (0 spikes on the
 * floor, 1 spikes on the ceiling, 2 a block floating in the middle, which kills anyone flying across). */
export interface GravityObstacle {
  x: number;
  w: number;
  side: number;
  /** Which spike this is (counts up from 1 each run); stays the same as it scrolls. */
  n: number;
}

export interface GravityPlayer {
  id: string;
  /** Height of their middle, 0 (floor) to 1 (ceiling). */
  y: number;
  /** The side they are on or heading for: 0 floor, 1 ceiling. */
  side: number;
  /** Still running. False once they hit a spike, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How far they have run, in metres: live while running, final once out. */
  meters: number;
}

export interface GravitySnapshot extends RoundSummary {
  id: 'gravity';
  phase: LobbyRoundPhase;
  /** Metres run so far by the course. */
  meters: number;
  /** Course speed in screens per second. */
  speed: number;
  spikes: GravityObstacle[];
  players: GravityPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

// ---- Laser gaps (rows of lasers fall; slide into the gap) ----------------------------------------

/** Where the players stand (down from the top), how wide and tall they are, and how thick a laser row is (all
 * fractions of the arena; what is drawn is what is hit). */
export const LASER_PLAYER_Y = 0.9;
export const LASER_PLAYER_WIDTH = 0.06;
export const LASER_PLAYER_HEIGHT = 0.05;
export const LASER_HEIGHT = 0.03;

/** A row of lasers across the whole width, except for a gap: `y` is its middle down from the top, `gap` the middle of
 * the gap across and `width` how wide it is. */
export interface LaserRow {
  y: number;
  gap: number;
  width: number;
  /** Which row this is (counts up from 1 each run); stays the same as it falls. */
  n: number;
}

export interface LaserPlayer {
  id: string;
  /** Where they stand across the screen (0..1). */
  x: number;
  /** The direction they are holding: -1, 0 or 1. */
  dir: number;
  /** Still going. False once they touch a beam, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How far the rows have fallen, in metres: live while going, final once out. */
  meters: number;
}

export interface LaserSnapshot extends RoundSummary {
  id: 'laser';
  phase: LobbyRoundPhase;
  meters: number;
  /** How fast the rows fall, in screens per second. */
  speed: number;
  rows: LaserRow[];
  players: LaserPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

// ---- Match (a colour name in another ink in front of a shape; tap the panel that matches the ink, the word or the shape, as asked) ---

/** The board has this many coloured panels (2 x 2, so panels are tap targets 0 to 3: red, blue, green, yellow; row by row). */
export const COLOR_MATCH_PANELS = 4;

/** Where a prompt is: waiting for answers, or the pause before the next one. */
export type ColorMatchStage = 'prompt' | 'between';

/** What a prompt asks for: the panel with the colour the word is written in, the colour the word names, or the shape shown. */
export type ColorMatchMode = 'ink' | 'word' | 'shape';
export const COLOR_MATCH_MODES: readonly ColorMatchMode[] = ['ink', 'word', 'shape'];

/** A prompt: `word` is the colour whose name is written, `ink` the colour it is written in and `shape` the panel whose shape is
 * drawn behind it, all three different panels; `mode` says which of them to tap (the right answer is that panel). */
export interface ColorMatchPrompt {
  word: number;
  ink: number;
  shape: number;
  mode: ColorMatchMode;
  /** Which prompt this is (counts up from 1 each round); 0 before the first. */
  n: number;
}

export interface ColorMatchPlayer {
  id: string;
  /** Lives left in an endless run (no time limit), or null in a timed round, which has none. */
  lives: number | null;
  /** Playing this round. False if they arrived mid-round (they watch and play from the next one). */
  alive: boolean;
  /** Rounds won since this person joined the lobby. */
  wins: number;
  /** Points this round. */
  meters: number;
  /** Answered the prompt on screen. */
  answered: boolean;
  /** Whether that answer was right (null before they answer). */
  right: boolean | null;
}

export interface ColorMatchSnapshot extends RoundSummary {
  id: 'colormatch';
  phase: LobbyRoundPhase;
  /** The most points anyone has so far. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Milliseconds left in the round while `playing`. */
  roundLeftMs: number;
  stage: ColorMatchStage;
  prompt: ColorMatchPrompt;
  /** Milliseconds the prompt has left to answer (`prompt` only), and how long it waits in all. */
  promptLeftMs: number;
  promptTotalMs: number;
  players: ColorMatchPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the round that just ended (`over` only); null when nobody did (a solo round, or a tie). */
  winnerId: string | null;
}

// ---- Hot potato (pass the bomb round the ring; whoever holds it when it goes off is out) -----------

export interface PotatoPlayer {
  id: string;
  /** Still in. False once the bomb has gone off in their hands, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Rounds they got through: live while in, final once out. */
  meters: number;
}

export interface PotatoSnapshot extends RoundSummary {
  id: 'potato';
  phase: LobbyRoundPhase;
  /** The round the bomb is on. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Who holds the bomb, or null in the pause between bombs. */
  holderId: string | null;
  /** Who threw it to them, or null if it was just handed out. */
  fromId: string | null;
  /** How many times it has been passed this run (so the view can tell a new throw from the last). */
  passes: number;
  /** How far the fuse has burned, 0 to 1, in eighths (the real length is never sent). */
  heat: number;
  /** Milliseconds until the holder can pass it on. */
  passCooldownMs: number;
  round: number;
  players: PotatoPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (everyone out together). */
  winnerId: string | null;
}

// ---- Anagram (one scrambled word; tap the tiles to spell it; first to spell it scores) ------------

/** The longest word is this many letters, so tiles are tap targets 0 to 5 and the take-back key is the next one. */
export const ANAGRAM_MAX_LETTERS = 6;
export const ANAGRAM_BACKSPACE = ANAGRAM_MAX_LETTERS;
export const ANAGRAM_TARGETS = ANAGRAM_MAX_LETTERS + 1;

/** Where a word is: being solved, or the pause that shows the answer before the next one. */
export type AnagramStage = 'play' | 'between';

/** What only the viewer sees: which tiles they have picked, in order. */
export interface AnagramMine {
  picked: number[];
}

export interface AnagramPlayer {
  id: string;
  /** Playing this round. False if they arrived mid-round (they watch and play from the next one). */
  alive: boolean;
  /** Rounds won since this person joined the lobby. */
  wins: number;
  /** Points this round. */
  meters: number;
  /** How many tiles they have picked (never which). */
  filled: number;
}

export interface AnagramSnapshot extends RoundSummary {
  id: 'anagram';
  phase: LobbyRoundPhase;
  /** The most points anyone has so far. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Milliseconds left in the round while `playing`. */
  roundLeftMs: number;
  stage: AnagramStage;
  /** Which word this is (counts up from 1 each round); 0 before the first. */
  wordNo: number;
  /** The scrambled letters, the same for everyone. */
  letters: string;
  /** Milliseconds this word has left (`play` only), and how long it gets in all. */
  wordLeftMs: number;
  wordTotalMs: number;
  /** The answer, once the word is over (`between` only); null while it can still be solved. */
  answer: string | null;
  /** Who solved the word that just ended (`between` only); null if nobody did. */
  solvedBy: string | null;
  /** The viewer's own picks; null for a spectator or someone who is only watching. */
  mine: AnagramMine | null;
  players: AnagramPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the round that just ended (`over` only); null when nobody did (a solo round, or a tie). */
  winnerId: string | null;
}

// ---- Minesweeper race (one shared minefield; open squares, a mine knocks you out) ----------------

/** The field is this many squares across and down (9 x 9 = 81 squares, tap targets 0 to 80, row by row), with this many mines. */
export const MINES_COLS = 9;
export const MINES_ROWS = 9;
export const MINES_COUNT = 10;
export const MINES_TARGETS = MINES_COLS * MINES_ROWS;

export interface MinesPlayer {
  id: string;
  /** Still in. False once they hit a mine, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Squares they opened this run. */
  meters: number;
  /** They hit a mine this run, so they are out (as opposed to never having been in it). */
  fell: boolean;
}

export interface MinesSnapshot extends RoundSummary {
  id: 'mines';
  phase: LobbyRoundPhase;
  /** The most squares anyone has opened so far. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** What each square shows, row by row: -1 not opened yet, 0 to 8 the number of mines next to it, 9 a mine someone hit. */
  cells: number[];
  /** Who opened each square, as an index into `players`; -1 for none. */
  by: number[];
  /** How many safe squares are still shut. */
  safeLeft: number;
  players: MinesPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

// ---- Perfect stop (stop the sweeping marker inside the target zone; it gets faster and smaller) --------

/** Where a round is: the marker is sweeping, or the pause that shows the result before the next round. */
export type StopStage = 'sweep' | 'result';

export interface StopPlayer {
  id: string;
  /** Still in. False once they missed the zone (or were too late), or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Rounds they cleared: live while in, final once out. */
  meters: number;
  /** They have stopped inside the zone this round. */
  stopped: boolean;
  /** Where on the bar they stopped this round (0..1), or -1. */
  at: number;
}

export interface StopSnapshot extends RoundSummary {
  id: 'stop';
  phase: LobbyRoundPhase;
  /** Rounds cleared by everyone still in. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  stage: StopStage;
  /** The round under way (counts up from 1 each run); 0 before the first. */
  round: number;
  /** The middle of the target zone on the bar (0..1) and how far it reaches either side. */
  centre: number;
  half: number;
  /** Where the marker is on the bar (0..1) while it sweeps; -1 otherwise. */
  marker: number;
  /** Milliseconds left before anyone who has not stopped is out (`sweep` only). */
  sweepLeftMs: number;
  players: StopPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or everyone out together). */
  winnerId: string | null;
}

// ---- Pong rally (one ball on a shared court; a paddle on each side; miss it and you are out) --------

/** A paddle on each of up to four sides (0 bottom, 1 top, 2 left, 3 right), and their size as fractions of the court. */
export const PONG_SEATS = 4;
export const PONG_PADDLE_LENGTH = 0.2;
export const PONG_PADDLE_THICKNESS = 0.035;
export const PONG_BALL_R = 0.022;
/** How fast a paddle slides, in court fractions a second. */
export const PONG_PADDLE_SPEED = 0.75;

export interface PongPlayer {
  id: string;
  /** Still in. False once they missed the ball, or if they arrived mid-run or are sitting this run out. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Returns they made this run: live while in, final once out. */
  meters: number;
  /** Which side is theirs this run (0 bottom, 1 top, 2 left, 3 right), or -1 if they are not playing. */
  seat: number;
  /** Where the middle of their paddle is along their side (0..1). */
  pos: number;
  /** The direction they are holding: -1, 0 or 1 (on the left and right sides, -1 is up). */
  dir: number;
}

export interface PongSnapshot extends RoundSummary {
  id: 'pong';
  phase: LobbyRoundPhase;
  /** Returns so far this run, by everyone. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Where the ball is and how fast it is going (court fractions a second), so a screen can carry on drawing it between snapshots. */
  ball: { x: number; y: number; vx: number; vy: number };
  /** The ball is waiting in the middle for a serve. */
  serving: boolean;
  players: PongPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (everyone out together). */
  winnerId: string | null;
}

// ---- Wall ball (a ball is hit against a wall and comes back for each player in turn) ------------------

/** The wall across the top, the row the players stand on, and the sizes (fractions of the court, down from the top) the screen draws and the rules hit with. */
export const WALL_Y = 0.1;
export const WALL_ROW_Y = 0.86;
export const WALL_BALL_R = 0.025;
export const WALL_PLAYER_R = 0.035;
/** How far from where the ball lands a player can still hit it (either side), and how fast they slide, in court fractions (a second). */
export const WALL_REACH = 0.1;
export const WALL_PLAYER_SPEED = 0.7;

export interface WallPlayer {
  id: string;
  /** Still in. False once they missed their turn, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Their own hits this run: live while in, final once out. */
  meters: number;
  /** Where they stand along the bottom (0..1) and the direction they are holding (-1, 0 or 1). */
  x: number;
  dir: number;
}

export interface WallSnapshot extends RoundSummary {
  id: 'wall';
  phase: LobbyRoundPhase;
  /** Hits so far this run, by everyone. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** Where the ball is and how fast it is going (court fractions a second), so a screen can carry it on between snapshots. */
  ball: { x: number; y: number; vx: number; vy: number };
  /** Going up to the wall after a hit, or coming down for the next player. */
  leg: 'up' | 'down';
  /** Whose turn it is: the one the ball is coming down for, or will come down for next. */
  targetId: string | null;
  /** Where it will land across the court (coming down only; -1 otherwise) and how long until it does. */
  landX: number;
  landInMs: number;
  players: WallPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (everyone out together). */
  winnerId: string | null;
}

// ---- Road hop (cross lane after lane of traffic before the screen sweeps you off the bottom) ----------

/** One row is this tall (a fraction of the arena), and the arena shows this many. */
export const FROGGER_ROW_H = 0.1;
export const FROGGER_ROWS_VISIBLE = 10;
/** A hopper's width, a fraction of the arena (drawing and being hit). */
export const FROGGER_FROG_W = 0.05;
/** Cars drive on a loop this far wider than the arena on each side, so they enter and leave off screen. */
export const FROGGER_CAR_MARGIN = 0.2;

/** One row of the road: grass is safe; on a road, `cars` are the middle of each car across the arena (-margin..1+margin) as of this snapshot,
 * all `w` wide, driving at `v` arena widths a second (negative is leftward). */
export interface FroggerRow {
  r: number;
  kind: 'grass' | 'road';
  v: number;
  w: number;
  cars: number[];
}

export interface FroggerPlayer {
  id: string;
  /** Where they are across the arena (0..1), the direction they are holding (-1, 0 or 1) and which row they stand on (0 is the first). */
  x: number;
  dir: number;
  row: number;
  /** Still hopping. False once hit by a car or swept off the bottom, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** How far they got, in metres (two a row): live while in, final once out. */
  meters: number;
}

export interface FroggerSnapshot extends RoundSummary {
  id: 'frogger';
  phase: LobbyRoundPhase;
  /** The furthest anyone has got, in metres. */
  meters: number;
  /** How fast the bottom edge of the screen is rising, in arenas a second. */
  speed: number;
  /** Where the bottom edge is, in arenas up from the start of the run. */
  edge: number;
  rows: FroggerRow[];
  players: FroggerPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

// ---- Fishing (keep your net on the fish while it thrashes, and land it before the line snaps) ------

/** The fish and the nets are on one line from the surface (0) down to the bottom of the pond (1). */
export interface FishingPlayer {
  id: string;
  /** Where the middle of their net is, how fast it is moving (ponds a second, down is positive) and whether they are reeling (holding the button, so it rises). */
  y: number;
  vy: number;
  reeling: boolean;
  /** The line's strength (0 to 1, full at the start): it wears down while the fish is outside their net and mends while it is inside; 0 snaps it. */
  health: number;
  /** How close they are to landing the fish (0 to 1): up while the fish is in their net, down (slowly) while it is not; 1 lands it. */
  catch: number;
  /** Fish they have landed this run. */
  landed: number;
  /** Still fishing. False once their line snaps, or if they arrived mid-run. */
  alive: boolean;
  /** Runs won since this person joined the lobby. */
  wins: number;
  /** Fish landed: live while in, final once out. */
  meters: number;
}

export interface FishingSnapshot extends RoundSummary {
  id: 'fishing';
  phase: LobbyRoundPhase;
  /** The most fish anyone has landed. */
  meters: number;
  /** Always 0: nothing scrolls past in this game (every snapshot carries a course speed). */
  speed: number;
  /** The fish: where it is and how fast it is going, so a screen can carry it on between snapshots. */
  fish: { y: number; vy: number };
  /** How tall (half of it, each way from the middle) a net is right now: it shrinks as the run goes on. */
  half: number;
  players: FishingPlayer[];
  /** Milliseconds left in `countdown` or `over`; 0 otherwise. */
  timerMs: number;
  /** Who won the run that just ended (`over` only); null when nobody did (a solo run, or a draw). */
  winnerId: string | null;
}

/** The snapshot of whichever game is running. */
export type LobbyGameSnapshot = RunnerSnapshot | FlappySnapshot | DodgeSnapshot | RopeSnapshot | CoinsSnapshot | BattleshipsSnapshot | RaceSnapshot | WhackSnapshot | DrawSnapshot | TiltSnapshot | StackerSnapshot | SumoSnapshot | AsteroidsSnapshot | MemorySnapshot | WordsSnapshot | LavaSnapshot | SnakeSnapshot | GravitySnapshot | LaserSnapshot | ColorMatchSnapshot | PotatoSnapshot | AnagramSnapshot | MinesSnapshot | StopSnapshot | PongSnapshot | WallSnapshot | FroggerSnapshot | FishingSnapshot;

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
  /** How long a run can last in this lobby right now, in seconds, or 0 for none (runs go on until they are beaten). */
  capSeconds: number;
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
