import type { LobbyGameId } from './spinLobby.js';

/** Where a recorded run was played. */
export type MiniGameScoreSource = 'solo' | 'lobby' | 'waiting_room';
export type MiniGameScoreScope = 'friends' | 'server';
export type MiniGameScorePeriod = 'all' | 'week';

/** The highest score a game can plausibly produce. Solo scores come from the player's own device, so the
 * server refuses anything above this (it cannot replay a run); it is generous, not exact. */
export const MINIGAME_SCORE_MAX: Record<LobbyGameId, number> = {
  runner: 20000,
  flappy: 20000,
  dodge: 20000,
  rope: 2000,
  coins: 2000,
  battleships: 100,
  race: 20000,
  whack: 1000,
  draw: 10000, // a reaction time in milliseconds
  tilt: 100,
  stacker: 200,
  sumo: 200,
  asteroids: 500,
  memory: 60,
  words: 60,
  snake: 576,
  gravity: 20000,
  laser: 20000,
  colormatch: 1000,
  potato: 20000, // tenths of a second held
  anagram: 500,
  mines: 71,
  stop: 200,
  pong: 100000,
  wall: 100000,
  frogger: 20000,
  fishing: 2000, // the most health the bar reached
  orbit: 3600, // seconds lasted
  rps: 100, // rounds won
  rhythm: 5000, // points
  sortit: 2000, // items sorted
  tempo: 5000, // points
  lava: 3600, // metres the screen climbed
  tunnel: 3600, // metres the tunnel came
  parachute: 3600, // metres fallen
  oddoneout: 2000, // right taps
};

/** Each game's rules version. A score is saved with the version it was played under, and the high score lists show only the
 * current version, so a game whose rules change enough that old scores no longer compare (a different course, a different
 * meaning for the score) starts a fresh list; the old scores stay in the database. **Raise a game's number whenever you change
 * how it plays or scores in a way that makes an old score unfair against a new one.** A new game starts at 1. */
export const MINIGAME_VERSIONS: Record<LobbyGameId, number> = {
  runner: 4, // no top speed
  flappy: 2, // no top speed
  dodge: 3, // no top speed
  rope: 2, // no floor on how quick a swing gets
  coins: 4, // endless runs have a health bar that drains, and no top speed; (before: only a bomb put you out)
  battleships: 2, // a player's own ships may touch
  race: 4, // no top speed
  whack: 4, // endless: moles keep getting quicker with no floor; before: three lives, shared moles, shorter up time, pauses
  draw: 2, // the score became a reaction time in milliseconds
  tilt: 2, // a ball each, tipped by where the balls are
  stacker: 2, // the light has no top speed
  sumo: 1,
  asteroids: 2, // no top speed
  memory: 2, // no cap on the rounds
  words: 1,
  snake: 1,
  gravity: 4, // no top speed
  laser: 2, // no top speed
  colormatch: 5, // the shape ask is gone (just the ink or the word); before: slower prompts (3.2 seconds to start) and a longer pause between them; before: endless with three lives when there is no time limit, the prompt asks for the ink, the word or the shape, changing each time
  potato: 2, // the score became the time held, not the rounds survived
  anagram: 3, // a word nobody solves in time ends the run; before: words start at 3 letters and grow to 6, and before that 5 and 6 letters from the first word
  mines: 1,
  stop: 1,
  pong: 1,
  wall: 1,
  frogger: 1,
  fishing: 4, // the score is the highest health reached (a health bar that drains and refills with fish), not points
  orbit: 2, // it keeps getting harder for as long as the run lasts
  rps: 1,
  rhythm: 1,
  sortit: 1,
  tempo: 1,
  lava: 3, // was a platform climb and then Bounce; scores from either are not comparable
  tunnel: 1,
  parachute: 3, // the sky speeds up four times as quickly, and gusts fade in and out
  oddoneout: 1,
};
export const miniGameVersion = (game: LobbyGameId): number => MINIGAME_VERSIONS[game];

/** The lowest score a game can really produce, where that is more than 1. Quick draw's score was points (1 to 3)
 * before it became a reaction time in ms (never under 100), so older rows below this are ignored when read. */
export const minScoreOf = (game: LobbyGameId): number => (game === 'draw' ? 100 : 1);

/** Games whose score is a time, where a smaller number is better (the high score list runs low to high). */
export const MINIGAME_LOWER_IS_BETTER: readonly LobbyGameId[] = ['draw'];
export const lowerIsBetter = (game: LobbyGameId): boolean => MINIGAME_LOWER_IS_BETTER.includes(game);

/** How many rows a leaderboard returns. */
export const MINIGAME_LEADERBOARD_SIZE = 8;
/** How many of a person's last runs `me` returns. */
export const MINIGAME_LAST_RUNS = 8;

export interface MiniGameScoreRow {
  rank: number;
  userId: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  score: number;
  /** When the best run was played (ISO). */
  at: string;
  source: MiniGameScoreSource;
  isMe: boolean;
}

export interface MiniGameScoresResponse {
  game: LobbyGameId;
  /** The rules version these scores were played under (the current one). */
  version: number;
  scope: MiniGameScoreScope;
  period: MiniGameScorePeriod;
  /** The top rows, one per person (their best in the period). Equal scores share a rank. */
  rows: MiniGameScoreRow[];
  /** The viewer's own rank in this list (null if they have no score in it). */
  myRank: number | null;
}

export interface MiniGameRun {
  score: number;
  at: string;
  source: MiniGameScoreSource;
}

export interface MiniGameMeResponse {
  game: LobbyGameId;
  best: number | null;
  /** Rank among friends, the viewer included (null with no score). */
  friendRank: number | null;
  friendCount: number;
  runsPlayed: number;
  /** The nearest friend ahead of the viewer, and how far ahead. */
  nextFriend: { displayName: string; gap: number } | null;
  lastRuns: MiniGameRun[];
}

/** The viewer's best score in each game they have played (a game with no run is missing). */
export interface MiniGameBestsResponse {
  bests: Partial<Record<LobbyGameId, number>>;
  /** Where that best ranks among the viewer's friends (and themselves) in each game they have a score in: 1 is top, and equal scores share a place. */
  friendRanks: Partial<Record<LobbyGameId, number>>;
}

// ---- Open lobbies (outside a room) -----------------------------------------------------------------

/** Who may join an open lobby: anyone on the server, the host's friends, or people with its invite code. */
export type MiniGameLobbyVisibility = 'public' | 'friends' | 'code';
export const MINIGAME_LOBBY_VISIBILITIES: readonly MiniGameLobbyVisibility[] = ['public', 'friends', 'code'];

/** The most people in one open lobby. */
export const MINIGAME_LOBBY_MAX_PLAYERS = 16;

/** Invite codes are 6 characters shown as XXX-XXX, without look-alike letters and digits. */
export const MINIGAME_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The 6 code characters in whatever someone pasted: a bare code, `7KX-4QP`, or a link ending in
 * `?code=7KX-4QP`. Null when there are not exactly 6 valid characters. */
export function parseLobbyCode(raw: string): string | null {
  const fromLink = /[?&]code=([^&#\s]+)/i.exec(raw);
  const chars = (fromLink ? fromLink[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (chars.length !== 6) return null;
  for (const c of chars) if (!MINIGAME_CODE_ALPHABET.includes(c)) return null;
  return chars;
}

export function formatLobbyCode(chars: string): string {
  return `${chars.slice(0, 3)}-${chars.slice(3)}`;
}

export interface MiniGameLobbyPlayer {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  /** A guest (no account): only in memory for as long as they are in the lobby. */
  guest?: boolean;
}

export interface MiniGameLobbyDto {
  id: string;
  visibility: MiniGameLobbyVisibility;
  /** The one game it plays, or null when it picks a random game after every run. */
  game: LobbyGameId | null;
  /** Every run is capped at `LOBBY_WAITING_ROOM_LIMIT_S` seconds, as in a spin's waiting room. */
  timeLimit: boolean;
  /** A lobby for one person to practise a game, run by the server so its scores can be trusted. Never listed, never joinable. */
  solo: boolean;
  hostId: string;
  /** You host it. */
  mine: boolean;
  /** Only for the host of an invite-code lobby. */
  code: string | null;
  /** Who is in it right now. */
  players: MiniGameLobbyPlayer[];
}

export interface MiniGameLobbiesResponse {
  lobbies: MiniGameLobbyDto[];
}

export interface CreateMiniGameLobbyRequest {
  visibility: MiniGameLobbyVisibility;
  game: LobbyGameId | null;
  /** Cap every run at 30 seconds, the way a spin's waiting room does. Off when left out. */
  timeLimit?: boolean;
  /** A private lobby just for you to practise `game` (which must be one game), on the server; its runs go on the high score list as solo. */
  solo?: boolean;
}

export interface JoinMiniGameLobbyRequest {
  code: string;
}

/** What someone without an account sees of a public lobby: first names and avatar colours only. */
export interface PublicMiniGameLobbyDto {
  id: string;
  game: LobbyGameId | null;
  hostName: string;
  players: { name: string; avatarColor: string }[];
  count: number;
}

export interface PublicMiniGameLobbiesResponse {
  lobbies: PublicMiniGameLobbyDto[];
}

export const GUEST_NAME_MIN = 2;
export const GUEST_NAME_MAX = 24;

export interface GuestJoinRequest {
  displayName: string;
  /** The sign-in page's Turnstile token, when the captcha is on. */
  captcha?: string;
}

/** A short-lived token for one lobby. Nothing about the guest is stored on the server. */
export interface GuestJoinResponse {
  token: string;
  lobbyId: string;
  guestId: string;
  displayName: string;
}

/** "This week" is the last 7 days, rolling, so the list never empties at a week boundary. */
export const MINIGAME_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Ranks scores that are already sorted best first: equal scores share a rank (1, 1, 3). */
export function rankScores(scores: number[]): number[] {
  const ranks: number[] = [];
  scores.forEach((s, i) => ranks.push(i > 0 && s === scores[i - 1] ? ranks[i - 1] : i + 1));
  return ranks;
}

/** A thumbs up (1) or thumbs down (-1) for a mini game. */
export type MiniGameRatingValue = 1 | -1;

export interface SetMiniGameRatingRequest {
  game: LobbyGameId;
  rating: MiniGameRatingValue;
}

/** The viewer's own rating for each game they have rated. */
export interface MiniGameRatingsResponse {
  ratings: Partial<Record<LobbyGameId, MiniGameRatingValue>>;
}

/** One game's ratings, as counts (never who voted), for the administrator page. */
export interface AdminMiniGameRating {
  game: LobbyGameId;
  up: number;
  down: number;
  total: number;
  /** Thumbs up as a share of all ratings, 0 to 1; null when nobody has rated it. */
  upShare: number | null;
  /** The same counts for ratings given or changed in the last 7 days, so a new game is not drowned by an old one's history. */
  upWeek: number;
  downWeek: number;
}

export interface AdminMiniGameRatingsResponse {
  games: AdminMiniGameRating[];
}

/** Each game's name in English, for text the server writes (a notification), where the app's own translated names are not to hand. */
export const MINIGAME_NAMES: Record<LobbyGameId, string> = {
  runner: 'Runner',
  flappy: 'Flappy',
  dodge: 'Dodge',
  rope: 'Jump rope',
  coins: 'Catch the coins',
  battleships: 'Battleships',
  race: 'Obstacle race',
  whack: 'Whack-a-mole',
  draw: 'Quick draw',
  tilt: 'Tilt',
  stacker: 'Stacker',
  sumo: 'Sumo ledge',
  asteroids: 'Asteroid defence',
  memory: 'Memory pattern',
  words: 'Words',
  snake: 'Snake arena',
  gravity: 'Gravity flip',
  laser: 'Laser gaps',
  colormatch: 'Match',
  potato: 'Hot potato',
  anagram: 'Anagram',
  mines: 'Minesweeper race',
  stop: 'Perfect stop',
  pong: 'Pong rally',
  wall: 'Wall ball',
  frogger: 'Road hop',
  fishing: 'Fishing',
  orbit: 'Orbit',
  rps: 'Rock paper scissors',
  rhythm: 'Rhythm lanes',
  sortit: 'Sort it',
  tempo: 'Steady tempo',
  lava: 'Lava',
  tunnel: 'Tunnel',
  parachute: 'Parachute',
  oddoneout: 'Odd one out',
};

/** Whether score `a` is better than score `b` in the game (a smaller time is better; otherwise bigger is). Equal is not better. */
export const scoreBeats = (game: LobbyGameId, a: number, b: number): boolean => (lowerIsBetter(game) ? a < b : a > b);

/** A score as people read it: a reaction time in ms, the time held in seconds, or the plain number. */
export function formatMiniGameScore(game: LobbyGameId, score: number): string {
  if (game === 'draw') return `${score} ms`;
  if (game === 'potato') return `${(score / 10).toFixed(1)} s`;
  return String(score);
}
