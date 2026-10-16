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
  redlight: 20,
  coins: 500,
  battleships: 100,
  race: 20000,
  whack: 200,
  draw: 3,
  tilt: 100,
  stacker: 200,
  sumo: 200,
  asteroids: 500,
  memory: 60,
  words: 60,
};

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
}

export interface MiniGameLobbyDto {
  id: string;
  visibility: MiniGameLobbyVisibility;
  /** The one game it plays, or null when it picks a random game after every run. */
  game: LobbyGameId | null;
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
}

export interface JoinMiniGameLobbyRequest {
  code: string;
}

export interface SubmitMiniGameScoreRequest {
  game: LobbyGameId;
  score: number;
}

/** "This week" is the last 7 days, rolling, so the list never empties at a week boundary. */
export const MINIGAME_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Ranks scores that are already sorted best first: equal scores share a rank (1, 1, 3). */
export function rankScores(scores: number[]): number[] {
  const ranks: number[] = [];
  scores.forEach((s, i) => ranks.push(i > 0 && s === scores[i - 1] ? ranks[i - 1] : i + 1));
  return ranks;
}
