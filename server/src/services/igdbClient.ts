import { redis } from './redisClient.js';
import { env } from '../config/env.js';
import { HttpError } from '../util/httpError.js';
import { getConfigValue } from './configResolver.js';
import { IGDB_PLATFORM_NAMES, type GameSearchResult, type RoomPlatform } from '@queueup/shared';

/** IGDB client id/secret, resolved env-first with a DB fallback (see configResolver.ts) - either
 * or both may be unset (env.ts no longer requires them at boot), in which case IGDB requests fail
 * with a clear 503 rather than crashing on a missing string. */
async function resolveIgdbCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const [clientId, clientSecret] = await Promise.all([
    getConfigValue('IGDB_CLIENT_ID', env.IGDB_CLIENT_ID),
    getConfigValue('IGDB_CLIENT_SECRET', env.IGDB_CLIENT_SECRET),
  ]);
  if (!clientId || !clientSecret) {
    throw new HttpError(
      503,
      'IGDB is not configured. Set IGDB_CLIENT_ID/IGDB_CLIENT_SECRET via env or the admin Settings panel.',
    );
  }
  return { clientId, clientSecret };
}

const TOKEN_CACHE_KEY = 'igdb:token:v1';
const DETAIL_CACHE_PREFIX = 'igdb:detail:v5:'; // v5: added releaseYear
const DETAIL_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h — title/cover/platform/steamAppId rarely change

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
}

async function fetchToken(): Promise<string> {
  const { clientId, clientSecret } = await resolveIgdbCredentials();
  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
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

export interface IgdbPlatform {
  name?: string;
}

interface IgdbGenre {
  name?: string;
}

export interface IgdbGame {
  id: number;
  name?: string;
  cover?: IgdbCover;
  platforms?: IgdbPlatform[];
  genres?: IgdbGenre[];
  first_release_date?: number;
  category?: number;
  version_parent?: number;
}

// IGDB's documented `category` enum (api-docs.igdb.com/#game-enums) - only the two values relevant
// to filtering search results: bundles and packs are compilations (base game + DLC/extras sold
// together), not a distinct title, and clutter search results with near-duplicates of a game
// someone's already searching for.
const IGDB_CATEGORY_BUNDLE = 3;
const IGDB_CATEGORY_PACK = 13;

/** True for the "real" entry a search result should surface: not a bundle/pack compilation, and
 * not an alternate version/edition of another game (IGDB links special/deluxe/GOTY editions back
 * to their canonical release via `version_parent` - the canonical release itself has none). DLC
 * and expansions are deliberately left alone; they're their own distinct canonical entries. */
export function isPrimaryEdition(game: IgdbGame): boolean {
  if (game.version_parent) return false;
  if (game.category === IGDB_CATEGORY_BUNDLE || game.category === IGDB_CATEGORY_PACK) return false;
  return true;
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
// checked before the plain "Switch" substring match (and each console generation before its
// family's bare name), or the more specific ones would never get a chance to match.
export function platformFamilies(platforms?: IgdbPlatform[]): RoomPlatform[] {
  const families = new Set<RoomPlatform>();
  for (const { name } of platforms ?? []) {
    if (!name) continue;
    const lower = name.toLowerCase();
    if (lower.includes('switch 2')) families.add('switch2');
    else if (lower.includes('switch')) families.add('switch');
    else if (lower.includes('xbox series')) families.add('xbox_series');
    else if (lower.includes('xbox one')) families.add('xbox_one');
    else if (lower.includes('xbox 360')) families.add('xbox_360');
    else if (lower.includes('playstation 5') || /\bps5\b/.test(lower)) families.add('ps5');
    else if (lower.includes('playstation 4') || /\bps4\b/.test(lower)) families.add('ps4');
    else if (lower.includes('playstation 3') || /\bps3\b/.test(lower)) families.add('ps3');
    else if (lower.includes('pc') || lower.includes('windows') || lower.includes('mac') || lower.includes('linux'))
      families.add('pc');
  }
  return Array.from(families);
}

function releaseYear(unixSeconds?: number): number | null {
  return unixSeconds ? new Date(unixSeconds * 1000).getUTCFullYear() : null;
}

function platformWhereClause(platforms: RoomPlatform[]): string {
  const names = platforms
    .flatMap((p) => IGDB_PLATFORM_NAMES[p])
    .map((n) => `"${n}"`)
    .join(',');
  return `where platforms.name = (${names});`;
}

async function igdbRequest<T>(endpoint: string, body: string): Promise<T> {
  const { clientId } = await resolveIgdbCredentials();
  const token = await getToken();
  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
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
        'Client-ID': clientId,
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

// Backslashes must be escaped before quotes, or an attacker-supplied backslash right before a
// quote combines with the one we insert (e.g. `\"` -> `\\"`) into an escaped-backslash-then-
// unescaped-quote sequence, closing the string early and injecting raw Apicalypse syntax.
export function escapeApicalypseString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function searchGames(query: string, platforms?: RoomPlatform[]): Promise<GameSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // An empty array means "no filter opted into yet" (e.g. Personal Shelf before the user has
  // ticked any owned systems) - treat it the same as undefined rather than matching nothing.
  const activePlatforms = platforms && platforms.length > 0 ? platforms : undefined;

  const escaped = escapeApicalypseString(trimmed);
  // Scoping the platform filter into the query itself (rather than fetching the top 20 results
  // overall and discarding non-matching ones afterward) matters: IGDB ranks "top 20 for this query
  // on this platform" when the where clause is present, instead of "top 20 for this query" full
  // stop - a specific-platform release (e.g. a Switch game with a generic title) can easily rank
  // outside the top 20 unfiltered results even though it'd be a top result once scoped.
  const whereClause = activePlatforms ? platformWhereClause(activePlatforms) : '';
  const games = await igdbRequest<IgdbGame[]>(
    'games',
    `search "${escaped}"; fields name,cover.image_id,platforms.name,first_release_date,category,version_parent; ${whereClause} limit 20;`,
  );

  return games
    .filter((g) => g.name)
    .filter(isPrimaryEdition)
    // Belt-and-suspenders: the query-level filter above should already scope results correctly,
    // but keep the client-side family check too in case IGDB's platform data on a given row is
    // incomplete/odd (e.g. a bundle with mixed platform tags).
    .filter((g) => !activePlatforms || platformFamilies(g.platforms).some((f) => activePlatforms.includes(f)))
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
  maxCoopPlayers: number | null;
  releaseYear: number | null;
  /** Hours for an average "main story" playthrough, from IGDB's game_time_to_beats endpoint
   * (issue #189) - null when IGDB has no time-to-beat data for this game. Sourced from IGDB
   * directly rather than scraping HowLongToBeat, which has no official public API. */
  timeToBeatHours: number | null;
}

// external_game_source 1 == Steam (from the external_game_sources endpoint) — the `games`
// endpoint has no direct Steam-appid field, so it's a separate lookup against external_games.
const STEAM_EXTERNAL_SOURCE_ID = 1;

interface IgdbExternalGame {
  uid: string;
}

interface IgdbMultiplayerMode {
  onlinecoopmax?: number;
  offlinecoopmax?: number;
}

// A game can have several multiplayer_modes rows (one per platform/mode) — take the highest
// co-op figure across all of them as "the most this game supports," rather than tying it to any
// one platform's row (IGDB's per-row platform tagging is inconsistent enough not to rely on).
function maxCoopFrom(modes: IgdbMultiplayerMode[]): number | null {
  const values = modes.flatMap((m) => [m.onlinecoopmax, m.offlinecoopmax]).filter((n): n is number => !!n && n > 0);
  return values.length > 0 ? Math.max(...values) : null;
}

interface IgdbMultiqueryResult<T> {
  name: string;
  result?: T[];
}

interface IgdbTimeToBeat {
  // Seconds, per IGDB's game_time_to_beats endpoint - "normally" is a typical/average completion,
  // the closest analog to HowLongToBeat's "Main Story" figure.
  normally?: number;
}

function timeToBeatHoursFrom(rows: IgdbTimeToBeat[]): number | null {
  const seconds = rows[0]?.normally;
  return seconds && seconds > 0 ? Math.round(seconds / 3600) : null;
}

export async function getGameDetail(igdbId: number): Promise<IgdbGameDetail> {
  if (!Number.isInteger(igdbId) || igdbId <= 0) {
    throw new HttpError(400, 'Invalid IGDB game id');
  }
  const cacheKey = DETAIL_CACHE_PREFIX + igdbId;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as IgdbGameDetail;

  // IGDB's `games`, `external_games` (Steam appid), `multiplayer_modes` (co-op limits), and
  // `game_time_to_beats` (issue #189) are separate endpoints with no way to join them in one
  // query, but IGDB's multiquery endpoint lets several such queries ride in a single HTTP request
  // instead of four round trips.
  const [gameResult, externalGamesResult, multiplayerModesResult, timeToBeatResult] = await igdbRequest<
    [
      IgdbMultiqueryResult<IgdbGame>,
      IgdbMultiqueryResult<IgdbExternalGame>,
      IgdbMultiqueryResult<IgdbMultiplayerMode>,
      IgdbMultiqueryResult<IgdbTimeToBeat>,
    ]
  >(
    'multiquery',
    `query games "Game" { fields name,cover.image_id,platforms.name,genres.name,first_release_date; where id = ${igdbId}; };
     query external_games "External" { fields uid; where game = ${igdbId} & external_game_source = ${STEAM_EXTERNAL_SOURCE_ID}; };
     query multiplayer_modes "Modes" { fields onlinecoopmax,offlinecoopmax; where game = ${igdbId}; };
     query game_time_to_beats "TimeToBeat" { fields normally; where game_id = ${igdbId}; };`,
  );

  const games = gameResult.result ?? [];
  const externalGames = externalGamesResult.result ?? [];
  const multiplayerModes = multiplayerModesResult.result ?? [];
  const timeToBeatRows = timeToBeatResult.result ?? [];

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
    maxCoopPlayers: maxCoopFrom(multiplayerModes),
    releaseYear: releaseYear(game.first_release_date),
    timeToBeatHours: timeToBeatHoursFrom(timeToBeatRows),
  };

  await redis.set(cacheKey, JSON.stringify(detail), 'EX', DETAIL_CACHE_TTL_SECONDS);
  return detail;
}

const STEAM_APP_ID_LOOKUP_CACHE_PREFIX = 'igdb:steam-appid-to-igdbid:v1:';
const STEAM_APP_ID_LOOKUP_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h — this mapping essentially never changes

/** Reverse of getGameDetail's steamAppId lookup: given a Steam AppID, finds the IGDB game id it
 * maps to (or null if IGDB has no external_games record for it). Used by Steam library import,
 * which only has AppIDs from the Steam Web API and needs IGDB ids to resolve full game data. */
export async function findIgdbIdBySteamAppId(steamAppId: number): Promise<number | null> {
  const cacheKey = STEAM_APP_ID_LOOKUP_CACHE_PREFIX + steamAppId;
  const cached = await redis.get(cacheKey);
  if (cached) return cached === 'null' ? null : Number(cached);

  const externalGames = await igdbRequest<Array<{ game: number }>>(
    'external_games',
    `fields game; where uid = "${steamAppId}" & external_game_source = ${STEAM_EXTERNAL_SOURCE_ID}; limit 1;`,
  );
  const igdbId = externalGames[0]?.game ?? null;

  await redis.set(cacheKey, igdbId === null ? 'null' : String(igdbId), 'EX', STEAM_APP_ID_LOOKUP_CACHE_TTL_SECONDS);
  return igdbId;
}
