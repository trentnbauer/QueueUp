import { redis } from './redisClient.js';
import { env } from '../config/env.js';
import { HttpError } from '../util/httpError.js';
import type { GameSearchResult, RoomPlatform } from '@squadqueue/shared';

const TOKEN_CACHE_KEY = 'igdb:token:v1';
const DETAIL_CACHE_PREFIX = 'igdb:detail:v3:'; // v3: added platformFamilies
const DETAIL_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h — title/cover/platform/steamAppId rarely change

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
}

async function fetchToken(): Promise<string> {
  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', env.IGDB_CLIENT_ID);
  url.searchParams.set('client_secret', env.IGDB_CLIENT_SECRET);
  url.searchParams.set('grant_type', 'client_credentials');

  const response = await fetch(url, { method: 'POST' });
  if (!response.ok) {
    throw new HttpError(502, `Could not authenticate with IGDB (Twitch returned ${response.status})`);
  }
  const body = (await response.json()) as TwitchTokenResponse;

  // Cache for slightly less than the real TTL so we never hand out an about-to-expire token.
  await redis.set(TOKEN_CACHE_KEY, body.access_token, 'EX', Math.max(60, body.expires_in - 300));
  return body.access_token;
}

async function getToken(): Promise<string> {
  const cached = await redis.get(TOKEN_CACHE_KEY);
  if (cached) return cached;
  return fetchToken();
}

interface IgdbCover {
  image_id?: string;
}

interface IgdbPlatform {
  name?: string;
}

interface IgdbGenre {
  name?: string;
}

interface IgdbGame {
  id: number;
  name?: string;
  cover?: IgdbCover;
  platforms?: IgdbPlatform[];
  genres?: IgdbGenre[];
  first_release_date?: number;
}

function coverUrl(cover?: IgdbCover): string | null {
  return cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${cover.image_id}.jpg` : null;
}

function platformLabel(platforms?: IgdbPlatform[]): string {
  const names = (platforms ?? []).map((p) => p.name).filter((n): n is string => !!n);
  return names.length > 0 ? names.join(', ') : 'PC';
}

function genreLabel(genres?: IgdbGenre[]): string | null {
  const names = (genres ?? []).map((g) => g.name).filter((n): n is string => !!n);
  return names.length > 0 ? names.join(', ') : null;
}

// Maps IGDB's granular platform names (e.g. "Xbox Series X|S", "PC (Microsoft Windows)") down to
// the handful of platform families a Room can be restricted to. Order matters: "Switch 2" must be
// checked before the plain "Switch" substring match, or it'd also match as "switch".
function platformFamilies(platforms?: IgdbPlatform[]): RoomPlatform[] {
  const families = new Set<RoomPlatform>();
  for (const { name } of platforms ?? []) {
    if (!name) continue;
    const lower = name.toLowerCase();
    if (lower.includes('switch 2')) families.add('switch2');
    else if (lower.includes('switch')) families.add('switch');
    else if (lower.includes('xbox')) families.add('xbox');
    else if (lower.includes('playstation') || /\bps[3-5]\b/.test(lower)) families.add('playstation');
    else if (lower.includes('pc') || lower.includes('windows') || lower.includes('mac') || lower.includes('linux'))
      families.add('pc');
  }
  return Array.from(families);
}

function releaseYear(unixSeconds?: number): number | null {
  return unixSeconds ? new Date(unixSeconds * 1000).getUTCFullYear() : null;
}

async function igdbRequest<T>(endpoint: string, body: string): Promise<T> {
  const token = await getToken();
  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body,
  });

  if (response.status === 401) {
    // Cached token expired/was revoked early — refresh once and retry.
    await redis.del(TOKEN_CACHE_KEY);
    const freshToken = await getToken();
    const retry = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': env.IGDB_CLIENT_ID,
        Authorization: `Bearer ${freshToken}`,
        'Content-Type': 'text/plain',
      },
      body,
    });
    if (!retry.ok) throw new HttpError(502, `IGDB request failed (${retry.status})`);
    return (await retry.json()) as T;
  }

  if (!response.ok) {
    throw new HttpError(502, `IGDB request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function searchGames(query: string, roomPlatform?: RoomPlatform): Promise<GameSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const escaped = trimmed.replace(/"/g, '\\"');
  const games = await igdbRequest<IgdbGame[]>(
    'games',
    `search "${escaped}"; fields name,cover.image_id,platforms.name,first_release_date; limit 8;`,
  );

  return games
    .filter((g) => g.name)
    .filter((g) => !roomPlatform || platformFamilies(g.platforms).includes(roomPlatform))
    .map((g) => ({
      igdbId: g.id,
      title: g.name!,
      platform: platformLabel(g.platforms),
      coverImageUrl: coverUrl(g.cover),
      releaseYear: releaseYear(g.first_release_date),
    }));
}

export interface IgdbGameDetail {
  igdbId: number;
  title: string;
  platform: string;
  platformFamilies: RoomPlatform[];
  genre: string | null;
  coverImageUrl: string | null;
  steamAppId: number | null;
}

// external_game_source 1 == Steam (from the external_game_sources endpoint) — the `games`
// endpoint has no direct Steam-appid field, so it's a separate lookup against external_games.
const STEAM_EXTERNAL_SOURCE_ID = 1;

interface IgdbExternalGame {
  uid: string;
}

export async function getGameDetail(igdbId: number): Promise<IgdbGameDetail> {
  if (!Number.isInteger(igdbId) || igdbId <= 0) {
    throw new HttpError(400, 'Invalid IGDB game id');
  }
  const cacheKey = DETAIL_CACHE_PREFIX + igdbId;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as IgdbGameDetail;

  const [games, externalGames] = await Promise.all([
    igdbRequest<IgdbGame[]>(
      'games',
      `fields name,cover.image_id,platforms.name,genres.name; where id = ${igdbId};`,
    ),
    igdbRequest<IgdbExternalGame[]>(
      'external_games',
      `fields uid; where game = ${igdbId} & external_game_source = ${STEAM_EXTERNAL_SOURCE_ID};`,
    ),
  ]);

  const game = games[0];
  if (!game || !game.name) {
    throw new HttpError(404, 'That game could not be found on IGDB.');
  }
  const steamUid = externalGames[0]?.uid;

  const detail: IgdbGameDetail = {
    igdbId: game.id,
    title: game.name,
    platform: platformLabel(game.platforms),
    platformFamilies: platformFamilies(game.platforms),
    genre: genreLabel(game.genres),
    coverImageUrl: coverUrl(game.cover),
    steamAppId: steamUid && /^\d+$/.test(steamUid) ? Number(steamUid) : null,
  };

  await redis.set(cacheKey, JSON.stringify(detail), 'EX', DETAIL_CACHE_TTL_SECONDS);
  return detail;
}
