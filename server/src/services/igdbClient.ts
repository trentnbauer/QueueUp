import { redis } from './redisClient.js';
import { env } from '../config/env.js';
import { HttpError } from '../util/httpError.js';
import { getConfigValue } from './configResolver.js';
import {
  IGDB_PLATFORM_NAMES,
  type CollectionGamesResult,
  type CollectionSearchResult,
  type GameSearchResult,
  type RoomPlatform,
} from '@queueup/shared';

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
const DETAIL_CACHE_PREFIX = 'igdb:detail:v8:'; // v8: added releaseDate (v7 added igdbCollectionId)
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

interface IgdbCollectionRef {
  id: number;
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
  collection?: IgdbCollectionRef;
  /** 0-100, IGDB's blended critic+user score - present for most games with any review coverage
   * at all. Preferred over aggregated_rating/rating individually (see reviewScoreFrom) since it's
   * already the single "how good is this" figure IGDB itself considers most representative. */
  total_rating?: number;
  /** 0-100, critic-only score - fallback when total_rating is missing (e.g. a game with press
   * reviews on file but not enough user ratings yet for IGDB to blend one in). */
  aggregated_rating?: number;
  /** 0-100, user-only score - last-resort fallback when neither of the above is present. */
  rating?: number;
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

// Full precision alongside releaseYear (issue #284) - the year alone can't tell "already released"
// from "releasing later this year."
function releaseDate(unixSeconds?: number): Date | null {
  return unixSeconds ? new Date(unixSeconds * 1000) : null;
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

interface IgdbCollection {
  id: number;
  name?: string;
}

export async function searchCollections(query: string): Promise<CollectionSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const escaped = escapeApicalypseString(trimmed);
  const collections = await igdbRequest<IgdbCollection[]>(
    'collections',
    `search "${escaped}"; fields name; limit 10;`,
  );
  return collections.filter((c) => c.name).map((c) => ({ collectionId: c.id, name: c.name! }));
}

interface IgdbCollectionWithGames extends IgdbCollection {
  games?: IgdbGame[];
}

// A franchise can run to dozens of entries once remasters/spinoffs/mobile ports are all counted -
// capped so "add the whole collection" can't kick off an enormous batch of intake calls (each one
// its own gg.deals pricing lookup) from a single click. Raised from 40 (a real long-running
// franchise - yearly sports titles, a series with many regional/DLC editions - can clear that
// easily) to 100, comfortably above nearly any real collection while still bounding the worst case.
const MAX_COLLECTION_GAMES = 100;

export async function getCollectionGames(
  collectionId: number,
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
): Promise<CollectionGamesResult> {
  if (!Number.isInteger(collectionId) || collectionId <= 0) {
    throw new HttpError(400, 'Invalid IGDB collection id');
  }

  const [collection] = await igdbRequest<IgdbCollectionWithGames[]>(
    'collections',
    `fields name,games.name,games.cover.image_id,games.platforms.name,games.first_release_date,games.category,games.version_parent; where id = ${collectionId};`,
  );
  if (!collection || !collection.name) {
    throw new HttpError(404, 'That collection could not be found on IGDB.');
  }

  const activePlatforms = platforms && platforms.length > 0 ? platforms : undefined;
  const allGames = (collection.games ?? [])
    .filter((g) => g.name)
    .filter(isPrimaryEdition)
    .filter((g) => !activePlatforms || platformFamilies(g.platforms).some((f) => activePlatforms.includes(f)))
    // Excluded *before* the MAX_COLLECTION_GAMES cap below, not after - otherwise a collection
    // with more entries than the cap could cut off real, not-yet-added games past position 40
    // that were never even considered, just because some of the first 40 (by release order)
    // happened to already be added.
    .filter((g) => !excludeIgdbIds || !excludeIgdbIds.has(g.id))
    // Oldest release first - the natural "play in order" sequence for a series.
    .sort((a, b) => (a.first_release_date ?? Infinity) - (b.first_release_date ?? Infinity))
    .map((g) => ({
      igdbId: g.id,
      title: g.name!,
      platform: platformLabel(g.platforms),
      coverImageUrl: coverUrl(g.cover),
      releaseYear: releaseYear(g.first_release_date),
    }));

  return {
    name: collection.name,
    games: allGames.slice(0, MAX_COLLECTION_GAMES),
    truncated: allGames.length > MAX_COLLECTION_GAMES,
  };
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
  /** Full precision alongside releaseYear (issue #284) - see the schema comment on Game.releaseDate. */
  releaseDate: Date | null;
  /** Hours for an average "main story" playthrough, from IGDB's game_time_to_beats endpoint
   * (issue #189) - null when IGDB has no time-to-beat data for this game. Sourced from IGDB
   * directly rather than scraping HowLongToBeat, which has no official public API. */
  timeToBeatHours: number | null;
  /** Hours for a rushed/speedrun-style playthrough, from IGDB's game_time_to_beats "hastily"
   * figure (issue #248) - always the smallest of the three figures on this scale (hastily <
   * normally < completely), the fastest way to reach the credits. Null when IGDB has no
   * time-to-beat data. */
  timeToBeatRushedHours: number | null;
  /** Hours for a full completionist (100%) playthrough, from IGDB's game_time_to_beats
   * "completely" figure (issue #248). Null when IGDB has no time-to-beat data. */
  timeToBeatCompletionistHours: number | null;
  /** IGDB's franchise/series id, if this game belongs to one (issue #283) - null otherwise. */
  igdbCollectionId: number | null;
  /** 0-100 review score (issue #311), see reviewScoreFrom - null when IGDB has no review data at
   * all for this game. Used to nudge Spin the Wheel toward better-reviewed games. */
  reviewScore: number | null;
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

export interface IgdbTimeToBeat {
  // Seconds, per IGDB's game_time_to_beats endpoint. These three figures are strictly ordered
  // (hastily < normally < completely) for any given game. "normally" is a typical/average
  // completion, the closest analog to HowLongToBeat's "Main Story" figure - kept as the sole
  // source of timeToBeatHours (issue #189) for backward compatibility (issue #248 added the
  // other two below without touching this one). "hastily" is a rushed/speedrun-style clear
  // (always less time than "normally", not more - it does not map onto HowLongToBeat's
  // "Main + Extra" figure) and "completely" is a full 100% completionist playthrough.
  normally?: number;
  hastily?: number;
  completely?: number;
}

export function secondsToHours(seconds: number | undefined): number | null {
  return seconds && seconds > 0 ? Math.round(seconds / 3600) : null;
}

export function timeToBeatHoursFrom(rows: IgdbTimeToBeat[]): number | null {
  return secondsToHours(rows[0]?.normally);
}

export function timeToBeatRushedHoursFrom(rows: IgdbTimeToBeat[]): number | null {
  return secondsToHours(rows[0]?.hastily);
}

export function timeToBeatCompletionistHoursFrom(rows: IgdbTimeToBeat[]): number | null {
  return secondsToHours(rows[0]?.completely);
}

/** Resolves a single 0-100 score from whichever of IGDB's three rating fields is present, in
 * order of preference (issue #311): total_rating (blended critic+user, IGDB's own best single
 * figure) first, then aggregated_rating (critic-only), then rating (user-only) - never averaging
 * across them, since falling back only when a "better" figure is entirely absent avoids
 * double-counting the same reviews that likely already fed into total_rating. Rounded to the
 * nearest integer (IGDB's raw values have decimal precision); null when none are present, rather
 * than defaulting to some baseline - "no review data" and "confirmed mediocre" aren't the same
 * thing, and Spin the Wheel's weighting (see spinCandidateWeight) treats a null the same as a
 * game nobody's voted on, not as a penalty. */
export function reviewScoreFrom(game: IgdbGame): number | null {
  const score = game.total_rating ?? game.aggregated_rating ?? game.rating;
  return typeof score === 'number' ? Math.round(score) : null;
}

export async function getGameDetail(igdbId: number): Promise<IgdbGameDetail> {
  if (!Number.isInteger(igdbId) || igdbId <= 0) {
    throw new HttpError(400, 'Invalid IGDB game id');
  }
  const cacheKey = DETAIL_CACHE_PREFIX + igdbId;
  const cached = await redis.get(cacheKey);
  if (cached) {
    // JSON has no Date type - releaseDate round-trips through the cache as a plain ISO string,
    // so it's revived back into a real Date here rather than leaking that string past this
    // function's declared return type.
    const parsed = JSON.parse(cached) as Omit<IgdbGameDetail, 'releaseDate'> & { releaseDate: string | null };
    return { ...parsed, releaseDate: parsed.releaseDate ? new Date(parsed.releaseDate) : null };
  }

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
    `query games "Game" { fields name,cover.image_id,platforms.name,genres.name,first_release_date,collection.id,total_rating,aggregated_rating,rating; where id = ${igdbId}; };
     query external_games "External" { fields uid; where game = ${igdbId} & external_game_source = ${STEAM_EXTERNAL_SOURCE_ID}; };
     query multiplayer_modes "Modes" { fields onlinecoopmax,offlinecoopmax; where game = ${igdbId}; };
     query game_time_to_beats "TimeToBeat" { fields normally,hastily,completely; where game_id = ${igdbId}; };`,
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
    releaseDate: releaseDate(game.first_release_date),
    timeToBeatHours: timeToBeatHoursFrom(timeToBeatRows),
    timeToBeatRushedHours: timeToBeatRushedHoursFrom(timeToBeatRows),
    timeToBeatCompletionistHours: timeToBeatCompletionistHoursFrom(timeToBeatRows),
    igdbCollectionId: game.collection?.id ?? null,
    reviewScore: reviewScoreFrom(game),
  };

  await redis.set(cacheKey, JSON.stringify(detail), 'EX', DETAIL_CACHE_TTL_SECONDS);
  return detail;
}

const STEAM_APP_ID_LOOKUP_CACHE_PREFIX = 'igdb:steam-appid-to-igdbid:v1:';
const STEAM_APP_ID_LOOKUP_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h — this mapping essentially never changes

/** Reverse of getGameDetail's steamAppId lookup: given a Steam AppID, finds the IGDB game id it
 * maps to (or null if IGDB has no external_games record for it). Used by Steam library import,
 * which only has AppIDs from the Steam Web API and needs IGDB ids to resolve full game data.
 *
 * IGDB sometimes attaches a Steam appid's external_games record to an edition-specific entry
 * (e.g. a Deluxe/GOTY SKU) rather than the canonical release, even when the canonical release is
 * what a manual search (searchGames, via isPrimaryEdition) resolves to. If that's left unresolved,
 * ownership recorded against the edition-specific id never matches the canonical id already used
 * elsewhere (e.g. a room's existing copy of the game), so the game looks unowned there. Follow
 * version_parent back to the canonical id before returning, same relationship isPrimaryEdition
 * checks in the other direction. */
export async function findIgdbIdBySteamAppId(steamAppId: number): Promise<number | null> {
  const cacheKey = STEAM_APP_ID_LOOKUP_CACHE_PREFIX + steamAppId;
  const cached = await redis.get(cacheKey);
  if (cached) return cached === 'null' ? null : Number(cached);

  const externalGames = await igdbRequest<Array<{ game: number }>>(
    'external_games',
    `fields game; where uid = "${steamAppId}" & external_game_source = ${STEAM_EXTERNAL_SOURCE_ID}; limit 1;`,
  );
  const rawIgdbId = externalGames[0]?.game ?? null;
  const igdbId = rawIgdbId === null ? null : await resolveToCanonicalIgdbId(rawIgdbId);

  await redis.set(cacheKey, igdbId === null ? 'null' : String(igdbId), 'EX', STEAM_APP_ID_LOOKUP_CACHE_TTL_SECONDS);
  return igdbId;
}

async function resolveToCanonicalIgdbId(igdbId: number): Promise<number> {
  const games = await igdbRequest<IgdbGame[]>('games', `fields version_parent; where id = ${igdbId};`);
  const versionParent = games[0]?.version_parent;
  return versionParent ?? igdbId;
}
