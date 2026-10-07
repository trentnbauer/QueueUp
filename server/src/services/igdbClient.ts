import { redis } from './redisClient.js';
import { env } from '../config/env.js';
import { HttpError } from '../util/httpError.js';
import { getConfigValue } from './configResolver.js';
import {
  IGDB_PLATFORM_NAMES,
  platformFamilyOf,
  sortPlatformLabel,
  withBackwardsCompatible,
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
const DETAIL_CACHE_PREFIX = 'igdb:detail:v9:'; // v9: added category/parentGameIgdbId (v8 added releaseDate, v7 added igdbCollectionId)
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
  /** "Single player", "Multiplayer", "Co-operative", "Split screen", "Massively Multiplayer Online (MMO)", "Battle Royale". */
  game_modes?: { name?: string }[];
  multiplayer_modes?: IgdbMultiplayerMode[];
  /** IGDB's own "games like this" list (#recommendations). */
  similar_games?: number[];
  cover?: IgdbCover;
  platforms?: IgdbPlatform[];
  genres?: IgdbGenre[];
  themes?: { name?: string }[];
  keywords?: { name?: string }[];
  first_release_date?: number;
  category?: number;
  version_parent?: number;
  /** IGDB's id for this game's base/parent game, present on DLC/expansion entries that have one on
   * file (issue #338) - absent on a main game, and sometimes absent even on a real DLC entry when
   * IGDB just doesn't have the link recorded. */
  parent_game?: number;
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
  /** How many ratings total_rating/aggregated_rating/rating are blended from - used as a
   * "how broadly recognized is this" popularity proxy (see getTrendingGames). Present on most
   * games with any review coverage, 0/absent otherwise. */
  total_rating_count?: number;
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

// The rest of IGDB's category enum relevant to issue #345's "hide DLC & add-ons" search filter -
// a long-running franchise (the issue's own example is Borderlands) can have as many DLC/season
// pass/expansion entries in IGDB as it has real games, crowding out the title someone's actually
// searching for. Deliberately narrow: remakes/remasters/ports/expanded re-releases are still their
// own purchasable titles people search for by name, not "junk" to hide.
const IGDB_CATEGORY_DLC_ADDON = 1;
const IGDB_CATEGORY_EXPANSION = 2;
const IGDB_CATEGORY_STANDALONE_EXPANSION = 4;
const IGDB_CATEGORY_SEASON = 7;
const ADDON_CATEGORIES: ReadonlySet<number> = new Set([
  IGDB_CATEGORY_DLC_ADDON,
  IGDB_CATEGORY_EXPANSION,
  IGDB_CATEGORY_STANDALONE_EXPANSION,
  IGDB_CATEGORY_SEASON,
]);

/** True for one of ADDON_CATEGORIES's category ids - the plain-number half of isAddonEdition,
 * usable once a game's category has already been captured at intake (issue #338's "ensure the
 * base game is added" needs this after resolveGameForCreation, not while still holding a raw
 * IgdbGame). */
export function isAddonCategory(category: number | null | undefined): boolean {
  return category != null && ADDON_CATEGORIES.has(category);
}

/** True for a DLC/expansion/season-pass entry - see ADDON_CATEGORIES. Used to hide these from
 * search results by default (issue #345), with a toggle to show them since they're still valid,
 * addable entries for someone who specifically wants one. */
export function isAddonEdition(game: IgdbGame): boolean {
  return isAddonCategory(game.category);
}

/** Stable tiered re-rank promoting the closest title matches to the front: an exact
 * (case-insensitive) match first, then anything whose title *contains* the query as a substring,
 * then everything else - each tier keeping IGDB's own relative order. Long-running franchises rack
 * up a dozen+ entries (sequels, remasters, collections, spin-offs, DLC), and IGDB's own relevance
 * ranking doesn't reliably put an exact match - e.g. the 2018 "God of War", named identically to
 * the 2005 original - ahead of same-franchise partial matches like "God of War: Ragnarök". The
 * substring tier fixes the same class of bug for a search that doesn't hit an exact match at all:
 * issue #373 found IGDB ranking unrelated titles like "Blood of Old" ahead of "Wolfenstein: The
 * Old Blood" for the query "the old blood", even though the latter contains the query verbatim. */
export function sortExactMatchFirst<T extends { name?: string }>(games: T[], query: string): T[] {
  const lowerQuery = query.trim().toLowerCase();
  function tier(game: T): 0 | 1 | 2 {
    const name = game.name?.toLowerCase();
    if (!name) return 2;
    if (name === lowerQuery) return 0;
    if (lowerQuery.length > 0 && name.includes(lowerQuery)) return 1;
    return 2;
  }
  return games
    .map((game, index) => ({ game, index, tier: tier(game) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((entry) => entry.game);
}

function coverUrl(cover?: IgdbCover): string | null {
  return cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${cover.image_id}.jpg` : null;
}

function platformLabel(platforms?: IgdbPlatform[]): string {
  const names = (platforms ?? []).map((p) => p.name).filter((n): n is string => !!n);
  return names.length > 0 ? sortPlatformLabel(names.join(', ')) : 'PC';
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
    const family = platformFamilyOf(name);
    if (family) families.add(family);
  }
  return Array.from(families);
}

/** IGDB themes/keywords that mark a game as adult (issue #627). Matched on the lower-cased name. */
const SENSITIVE_THEMES = new Set(['erotic']);
const SENSITIVE_KEYWORDS = new Set(['erotic', 'sexual content', 'high sexual content', 'nudity', 'hentai', 'pornographic', 'explicit sex']);

/** True if IGDB tags the game with an adult theme or keyword. */
export function isSensitiveContent(game: Pick<IgdbGame, 'themes' | 'keywords'>): boolean {
  const hit = (list: { name?: string }[] | undefined, set: Set<string>) =>
    (list ?? []).some((t) => !!t.name && set.has(t.name.trim().toLowerCase()));
  return hit(game.themes, SENSITIVE_THEMES) || hit(game.keywords, SENSITIVE_KEYWORDS);
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

// Page size for both the raw IGDB fetch and what's returned per call - the frontend calls back
// with an increasing `offset` (infinite scroll) until `hasMore` comes back false, so there's no
// need to over-fetch a single request the way a fixed top-N search would.
const SEARCH_PAGE_SIZE = 20;

// Issue #373: IGDB's own relevance ranking can bury the actual title someone's searching for
// well past position 20 - e.g. "the old blood" ranked several unrelated titles ahead of
// "Wolfenstein: The Old Blood". sortExactMatchFirst's substring tier can only promote a row that
// was actually fetched, so the first page pulls a wider raw batch to re-rank within before slicing
// back down to SEARCH_PAGE_SIZE for display. Later pages don't need this - by then the user is
// paging through IGDB's own order already, one screen at a time.
const SEARCH_FIRST_PAGE_RAW_LIMIT = 50;

export interface GameSearchPage {
  results: GameSearchResult[];
  /** Offset to pass on the next call to keep paging - always current offset + this page's raw
   * (pre-filter) IGDB row count, so consecutive pages tile the underlying IGDB result set exactly
   * once each, regardless of how many rows this page's isPrimaryEdition/platform filters dropped. */
  nextOffset: number;
  /** True once IGDB returned a full page of raw rows, i.e. there may be more beyond it. False once
   * a page comes back short - that's IGDB's own signal it has nothing further for this query. */
  hasMore: boolean;
}

/** Pure page-cursor arithmetic for searchGames, split out so it's unit-testable without a network
 * mock: `rawCount` is however many rows IGDB actually returned for this page (before any
 * isPrimaryEdition/platform filtering), which is what both `nextOffset` and `hasMore` key off.
 * `rawLimit` is whatever limit was actually requested for this page - the first page requests
 * SEARCH_FIRST_PAGE_RAW_LIMIT rather than SEARCH_PAGE_SIZE (see searchGames), so a full page there
 * looks like more raw rows than a later page's. */
export function nextSearchPage(
  offset: number,
  rawCount: number,
  rawLimit: number = SEARCH_PAGE_SIZE,
): { nextOffset: number; hasMore: boolean } {
  return { nextOffset: offset + rawCount, hasMore: rawCount === rawLimit };
}

export async function searchGames(
  query: string,
  platforms?: RoomPlatform[],
  offset = 0,
  // Opt-out (issue #345): DLC/expansion/season-pass entries are hidden by default, since a search
  // result list dominated by a franchise's add-ons is the reported problem. Explicitly passing
  // false shows everything, for the person who's actually looking for one.
  hideAddons = true,
): Promise<GameSearchPage> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], nextOffset: 0, hasMore: false };

  // An empty array means "no filter opted into yet" (e.g. Personal Shelf before the user has
  // ticked any owned systems) - treat it the same as undefined rather than matching nothing.
  const activePlatforms = platforms && platforms.length > 0 ? withBackwardsCompatible(platforms) : undefined;

  const escaped = escapeApicalypseString(trimmed);
  // Scoping the platform filter into the query itself (rather than fetching the top results
  // overall and discarding non-matching ones afterward) matters: IGDB ranks "top N for this query
  // on this platform" when the where clause is present, instead of "top N for this query" full
  // stop - a specific-platform release (e.g. a Switch game with a generic title) can easily rank
  // outside the top unfiltered results even though it'd be a top result once scoped.
  const whereClause = activePlatforms ? platformWhereClause(activePlatforms) : '';
  // See SEARCH_FIRST_PAGE_RAW_LIMIT: only the first page needs the wider raw batch to re-rank
  // within, since it's the only page sortExactMatchFirst reorders below.
  const rawLimit = offset === 0 ? SEARCH_FIRST_PAGE_RAW_LIMIT : SEARCH_PAGE_SIZE;
  const games = await igdbRequest<IgdbGame[]>(
    'games',
    `search "${escaped}"; fields name,cover.image_id,platforms.name,first_release_date,category,version_parent; ${whereClause} limit ${rawLimit}; offset ${offset};`,
  );

  const filtered = games
    .filter((g) => g.name)
    .filter(isPrimaryEdition)
    .filter((g) => !hideAddons || !isAddonEdition(g))
    // Belt-and-suspenders: the query-level filter above should already scope results correctly,
    // but keep the client-side family check too in case IGDB's platform data on a given row is
    // incomplete/odd (e.g. a bundle with mixed platform tags).
    .filter((g) => !activePlatforms || platformFamilies(g.platforms).some((f) => activePlatforms.includes(f)));

  // Only the first page gets exact/substring-match promotion (e.g. the 2018 "God of War", named
  // identically to the 2005 original, jumping ahead of same-franchise partial matches like
  // "Ragnarök") - later pages are reordered within themselves only, which would just shuffle
  // results already on screen for no benefit. Long-running franchises are still fully browsable
  // via pagination regardless of where IGDB's own relevance ranking happens to place any
  // individual title. Sliced back down to SEARCH_PAGE_SIZE since the first page fetched a wider
  // raw batch (SEARCH_FIRST_PAGE_RAW_LIMIT) purely to give the re-rank something to promote from.
  const ordered = offset === 0 ? sortExactMatchFirst(filtered, trimmed).slice(0, SEARCH_PAGE_SIZE) : filtered;

  return {
    results: ordered.map((g) => ({
      igdbId: g.id,
      title: g.name!,
      platform: platformLabel(g.platforms),
      coverImageUrl: coverUrl(g.cover),
      releaseYear: releaseYear(g.first_release_date),
    })),
    ...nextSearchPage(offset, games.length, rawLimit),
  };
}

// Fixed-size browse list (issue #363) rather than paginated like searchGames - this is a "browse
// for inspiration" tab, not something someone scrolls through exhaustively. Fetches a wider raw
// batch than it returns since isPrimaryEdition/hideAddons/platform/excludeIgdbIds filtering (same
// as searchGames) can drop a meaningful fraction of the most-rated titles (long-running franchises
// place several editions near the top; already-owned games get excluded entirely).
const TRENDING_RESULT_LIMIT = 24;
const TRENDING_RAW_LIMIT = 60;

/** Issue #363: backs the Add Game modal's "Popular" browse tab, for discovering something nobody
 * had already thought to search for. Ranked by IGDB's total_rating_count (how many people have
 * rated a title) rather than IGDB's separate popularity_primitives endpoint - that tracks more
 * transient signals (Twitch viewership, recent Steam concurrent players, Google Trends, etc.)
 * behind an internal popularity_type id enum this project has no verified/documented mapping for,
 * and guessing at one risked silently ranking by the wrong signal with no way to tell from the
 * response alone. total_rating_count is a stable, already-used field (see reviewScoreFrom) that
 * reliably surfaces broadly-recognized titles - not literally "trending this month," but a
 * defensible, verifiable reading of "popular" for group discovery. */
export async function getTrendingGames(
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
  hideAddons = true,
): Promise<GameSearchResult[]> {
  const activePlatforms = platforms && platforms.length > 0 ? withBackwardsCompatible(platforms) : undefined;
  const whereClauses = ['total_rating_count > 0'];
  if (activePlatforms) {
    const names = activePlatforms.flatMap((p) => IGDB_PLATFORM_NAMES[p]).map((n) => `"${n}"`).join(',');
    whereClauses.push(`platforms.name = (${names})`);
  }

  const games = await igdbRequest<IgdbGame[]>(
    'games',
    `fields name,cover.image_id,platforms.name,first_release_date,category,version_parent,total_rating_count; where ${whereClauses.join(' & ')}; sort total_rating_count desc; limit ${TRENDING_RAW_LIMIT};`,
  );

  const filtered = games
    .filter((g) => g.name)
    .filter(isPrimaryEdition)
    .filter((g) => !hideAddons || !isAddonEdition(g))
    .filter((g) => !activePlatforms || platformFamilies(g.platforms).some((f) => activePlatforms.includes(f)))
    .filter((g) => !excludeIgdbIds || !excludeIgdbIds.has(g.id));

  return filtered.slice(0, TRENDING_RESULT_LIMIT).map((g) => ({
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
  // Opt-out (issue #354): a franchise collection (e.g. Borderlands 2) mixes its DLC/expansion/
  // season-pass entries in with the real games, same as a flat search - this needs to honor the
  // same "Hide DLC & add-ons" toggle as searchGames, or unchecking the box in the search list did
  // nothing once someone opened the collection review screen.
  hideAddons = true,
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

  const activePlatforms = platforms && platforms.length > 0 ? withBackwardsCompatible(platforms) : undefined;
  const allGames = (collection.games ?? [])
    .filter((g) => g.name)
    .filter(isPrimaryEdition)
    .filter((g) => !hideAddons || !isAddonEdition(g))
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

interface IgdbGameWithAddons extends IgdbGame {
  dlcs?: IgdbGame[];
  expansions?: IgdbGame[];
}

const TRAILER_CACHE_PREFIX = 'igdb:trailer:v1:';
const TRAILER_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // a trailer rarely changes; a week is plenty

interface IgdbVideo {
  video_id?: string;
  name?: string;
}

/** The game's trailer as a YouTube video id (IGDB's `game_videos`), preferring one named like a
 * trailer, else the first video. Cached (including "no video") in Redis, so opening a game's trailer
 * costs one IGDB call per game per week at most. */
export async function getGameTrailer(igdbId: number): Promise<{ youtubeId: string; name: string | null } | null> {
  if (!Number.isInteger(igdbId) || igdbId <= 0) throw new HttpError(400, 'Invalid IGDB game id');
  const cacheKey = TRAILER_CACHE_PREFIX + igdbId;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as { youtubeId: string; name: string | null } | null;

  const videos = await igdbRequest<IgdbVideo[]>('game_videos', `fields video_id,name; where game = ${igdbId}; limit 20;`);
  // YouTube ids are 11 URL-safe characters; anything else is not safe to put in an embed URL.
  const valid = videos.filter((v) => v.video_id && /^[A-Za-z0-9_-]{11}$/.test(v.video_id));
  const pick = valid.find((v) => /trailer/i.test(v.name ?? '')) ?? valid[0];
  const result = pick ? { youtubeId: pick.video_id as string, name: pick.name ?? null } : null;
  await redis.set(cacheKey, JSON.stringify(result), 'EX', TRAILER_CACHE_TTL_SECONDS);
  return result;
}

const DLC_CACHE_PREFIX = 'igdb:dlcs:v1:';
const DLC_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h - a game's DLC lineup essentially never changes

/** The raw, cached DLC/expansion entries for a base game, shared by getGameDlcs and
 * getUpcomingGameDlcs. IGDB models these as two separate relations off the base game (`dlcs` and
 * `expansions`) - merged here since QueueUp treats both the same way (see ADDON_CATEGORIES), and
 * deduped by igdb id since IGDB occasionally lists the same entry under both. */
async function loadDlcEntries(igdbId: number): Promise<IgdbGame[]> {
  if (!Number.isInteger(igdbId) || igdbId <= 0) {
    throw new HttpError(400, 'Invalid IGDB game id');
  }

  const cacheKey = DLC_CACHE_PREFIX + igdbId;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as IgdbGame[];

  const [game] = await igdbRequest<IgdbGameWithAddons[]>(
    'games',
    `fields dlcs.name,dlcs.cover.image_id,dlcs.platforms.name,dlcs.first_release_date,expansions.name,expansions.cover.image_id,expansions.platforms.name,expansions.first_release_date; where id = ${igdbId};`,
  );
  const byId = new Map<number, IgdbGame>();
  for (const g of [...(game?.dlcs ?? []), ...(game?.expansions ?? [])]) {
    if (g.name) byId.set(g.id, g);
  }
  const entries = Array.from(byId.values());
  await redis.set(cacheKey, JSON.stringify(entries), 'EX', DLC_CACHE_TTL_SECONDS);
  return entries;
}

/** A base game's DLC and expansions that have a release date in the half-open window (from, to],
 * with the full date (getGameDlcs only keeps the year). Reads the same 24h cache. Issue #869. */
export async function getUpcomingGameDlcs(
  igdbId: number,
  from: Date,
  to: Date,
): Promise<(GameSearchResult & { releaseDate: string })[]> {
  const entries = await loadDlcEntries(igdbId);
  return entries
    .filter((g) => g.first_release_date !== undefined && g.first_release_date * 1000 > from.getTime() && g.first_release_date * 1000 <= to.getTime())
    .sort((a, b) => a.first_release_date! - b.first_release_date!)
    .map((g) => ({
      igdbId: g.id,
      title: g.name!,
      platform: platformLabel(g.platforms),
      coverImageUrl: coverUrl(g.cover),
      releaseYear: releaseYear(g.first_release_date),
      releaseDate: new Date(g.first_release_date! * 1000).toISOString(),
    }));
}

/** All DLC/expansion entries IGDB has on file for a given base game (issue #338 - backs the game
 * modal's "View DLC" browse-and-add list). Cached same as getGameDetail (a title's DLC lineup
 * essentially never changes once released) - excludeIgdbIds/platforms filtering happens after the
 * cache read, not baked into the cached value, so the same cached list serves every room/shelf's
 * differently-scoped request. */
export async function getGameDlcs(
  igdbId: number,
  platforms?: RoomPlatform[],
  excludeIgdbIds?: Set<number>,
): Promise<GameSearchResult[]> {
  const entries = await loadDlcEntries(igdbId);

  const activePlatforms = platforms && platforms.length > 0 ? withBackwardsCompatible(platforms) : undefined;
  return entries
    // Unlike searchGames' identical-looking filter (genuinely "belt-and-suspenders" there, since
    // an Apicalypse `where` clause already scoped the query server-side), this is the *only*
    // platform filter applied here - there's no equivalent where-clause on a dlcs/expansions
    // traversal. IGDB's platform data on DLC/expansion entries is much spottier than on full games,
    // so treating a missing platforms list as "excluded" would silently empty this list for exactly
    // the games most likely to have real, addable DLC. An entry with no platform data at all is
    // kept rather than dropped - the base game is already confirmed on this room/shelf's platform,
    // so its DLC almost certainly is too.
    .filter(
      (g) =>
        !activePlatforms ||
        platformFamilies(g.platforms).length === 0 ||
        platformFamilies(g.platforms).some((f) => activePlatforms.includes(f)),
    )
    .filter((g) => !excludeIgdbIds || !excludeIgdbIds.has(g.id))
    // Oldest release first - same "play in order" convention as getCollectionGames.
    .sort((a, b) => (a.first_release_date ?? Infinity) - (b.first_release_date ?? Infinity))
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
  /** IGDB tags this as adult content (see isSensitiveContent). Absent on details cached before this existed. */
  sensitiveContent?: boolean;
  title: string;
  platform: string;
  platformFamilies: RoomPlatform[];
  genre: string | null;
  coverImageUrl: string | null;
  steamAppId: number | null;
  maxCoopPlayers: number | null;
  /** Single player is IGDB's only mode for it; null when unknown. Absent on details cached before this existed. */
  singlePlayerOnly?: boolean | null;
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
  /** IGDB's raw category enum value (issue #338) - see ADDON_CATEGORIES/isAddonCategory. Null when
   * IGDB has no category on file (rare, but not the same as "main_game", which is category 0). */
  category: number | null;
  /** IGDB's id for this game's base/parent game, if this is DLC/an expansion with one on file
   * (issue #338) - null for a main game, or for an add-on IGDB has no parent link recorded for. */
  parentGameIgdbId: number | null;
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
  campaigncoop?: boolean;
  lancoop?: boolean;
  offlinecoop?: boolean;
  onlinecoop?: boolean;
  splitscreen?: boolean;
}

/** How a game can be played, from IGDB's game modes and multiplayer modes. */
export interface PlayModes {
  /** Single player is its only mode. Null when IGDB lists no modes at all. */
  singlePlayerOnly: boolean | null;
  /** Has co-op (online, local, LAN or a co-op campaign). */
  coop: boolean;
}

export function playModesFrom(modes: { name?: string }[] | undefined, multiplayer: IgdbMultiplayerMode[] | undefined): PlayModes {
  const names = (modes ?? []).map((m) => m.name?.toLowerCase() ?? '').filter(Boolean);
  const mp = multiplayer ?? [];
  const coop =
    // Split screen alone isn't co-op: it also covers competitive local play (a kart racer).
    names.some((n) => n.includes('co-op') || n.includes('cooperative') || n.includes('co-operative')) ||
    mp.some((m) => m.campaigncoop || m.lancoop || m.offlinecoop || m.onlinecoop || (m.onlinecoopmax ?? 0) > 1 || (m.offlinecoopmax ?? 0) > 1);
  if (names.length === 0) return { singlePlayerOnly: null, coop };
  return { singlePlayerOnly: !coop && names.every((n) => n === 'single player'), coop };
}

const PLAY_MODE_FIELDS = 'game_modes.name,multiplayer_modes.onlinecoopmax,multiplayer_modes.offlinecoopmax,multiplayer_modes.campaigncoop,multiplayer_modes.lancoop,multiplayer_modes.offlinecoop,multiplayer_modes.onlinecoop,multiplayer_modes.splitscreen';

/** Play modes for up to 500 games in one request. Games IGDB doesn't return are left out. */
export async function getPlayModes(igdbIds: number[]): Promise<Map<number, PlayModes>> {
  const ids = [...new Set(igdbIds)].filter((id) => Number.isInteger(id) && id > 0).slice(0, 500);
  if (ids.length === 0) return new Map();
  const games = await igdbRequest<IgdbGame[]>('games', `fields ${PLAY_MODE_FIELDS}; where id = (${ids.join(',')}); limit 500;`);
  return new Map(games.map((g) => [g.id, playModesFrom(g.game_modes, g.multiplayer_modes)]));
}

/** What a suggestion card shows beyond the search result: IGDB's 0-100 review score (see
 * reviewScoreFrom) and its genres, e.g. "Shooter, Adventure". Either is null when IGDB has none. */
export interface PickDetails {
  reviewScore: number | null;
  genre: string | null;
}

/** Score and genres for up to 500 games in one request. A game IGDB doesn't return is left out. */
export async function getPickDetails(igdbIds: number[]): Promise<Map<number, PickDetails>> {
  const ids = [...new Set(igdbIds)].filter((id) => Number.isInteger(id) && id > 0).slice(0, 500);
  if (ids.length === 0) return new Map();
  const games = await igdbRequest<IgdbGame[]>('games', `fields total_rating,aggregated_rating,rating,genres.name; where id = (${ids.join(',')}); limit 500;`);
  return new Map(games.map((g) => [g.id, { reviewScore: reviewScoreFrom(g), genre: genreLabel(g.genres) }]));
}

/** A game suggested because it's like something already in the shelf/room. */
export interface SimilarGameCandidate extends GameSearchResult {
  /** How many of the seed games list it as similar - the strongest signal. */
  hits: number;
  /** The seed game it was most directly suggested by. */
  becauseOf: number;
  reviewScore: number | null;
  ratingCount: number;
  playModes: PlayModes;
  platformFamilies: RoomPlatform[];
}

const SIMILAR_CANDIDATE_LIMIT = 120;

/** Games IGDB lists as similar to `seedIds`, with their details and play modes, excluding
 * `exclude` (already owned/added). Two requests: the seeds' similar_games lists, then details for
 * the most-mentioned candidates. */
export async function getSimilarGames(seedIds: number[], exclude: Set<number>): Promise<SimilarGameCandidate[]> {
  const seeds = [...new Set(seedIds)].filter((id) => Number.isInteger(id) && id > 0).slice(0, 50);
  if (seeds.length === 0) return [];
  const seedRows = await igdbRequest<IgdbGame[]>('games', `fields similar_games; where id = (${seeds.join(',')}); limit 50;`);
  const hits = new Map<number, { count: number; becauseOf: number }>();
  // Seeds come in priority order, so the first seed to mention a game is the best "because of".
  const order = new Map(seeds.map((id, i) => [id, i]));
  for (const row of [...seedRows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))) {
    for (const id of row.similar_games ?? []) {
      if (exclude.has(id) || seeds.includes(id)) continue;
      const h = hits.get(id);
      if (h) h.count++;
      else hits.set(id, { count: 1, becauseOf: row.id });
    }
  }
  const ranked = [...hits.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, SIMILAR_CANDIDATE_LIMIT);
  if (ranked.length === 0) return [];
  const rows = await igdbRequest<IgdbGame[]>(
    'games',
    `fields name,cover.image_id,platforms.name,first_release_date,category,version_parent,total_rating,aggregated_rating,rating,total_rating_count,${PLAY_MODE_FIELDS}; where id = (${ranked.map(([id]) => id).join(',')}); limit ${SIMILAR_CANDIDATE_LIMIT};`,
  );
  return rows
    .filter((g) => g.name)
    .filter(isPrimaryEdition)
    .filter((g) => !isAddonEdition(g))
    .filter((g) => !isSensitiveContent(g))
    .map((g) => {
      const h = hits.get(g.id)!;
      return {
        igdbId: g.id,
        title: g.name!,
        platform: platformLabel(g.platforms),
        coverImageUrl: coverUrl(g.cover),
        releaseYear: releaseYear(g.first_release_date),
        hits: h.count,
        becauseOf: h.becauseOf,
        reviewScore: reviewScoreFrom(g),
        ratingCount: g.total_rating_count ?? 0,
        playModes: playModesFrom(g.game_modes, g.multiplayer_modes),
        platformFamilies: platformFamilies(g.platforms),
      };
    });
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
    `query games "Game" { fields name,cover.image_id,platforms.name,genres.name,themes.name,keywords.name,first_release_date,collection.id,total_rating,aggregated_rating,rating,category,parent_game,game_modes.name; where id = ${igdbId}; };
     query external_games "External" { fields uid; where game = ${igdbId} & external_game_source = ${STEAM_EXTERNAL_SOURCE_ID}; };
     query multiplayer_modes "Modes" { fields onlinecoopmax,offlinecoopmax,campaigncoop,lancoop,offlinecoop,onlinecoop,splitscreen; where game = ${igdbId}; };
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
    singlePlayerOnly: playModesFrom(game.game_modes, multiplayerModes).singlePlayerOnly,
    releaseYear: releaseYear(game.first_release_date),
    releaseDate: releaseDate(game.first_release_date),
    timeToBeatHours: timeToBeatHoursFrom(timeToBeatRows),
    timeToBeatRushedHours: timeToBeatRushedHoursFrom(timeToBeatRows),
    timeToBeatCompletionistHours: timeToBeatCompletionistHoursFrom(timeToBeatRows),
    igdbCollectionId: game.collection?.id ?? null,
    reviewScore: reviewScoreFrom(game),
    category: game.category ?? null,
    parentGameIgdbId: game.parent_game ?? null,
    sensitiveContent: isSensitiveContent(game),
  };

  await redis.set(cacheKey, JSON.stringify(detail), 'EX', DETAIL_CACHE_TTL_SECONDS);
  return detail;
}

/** One age rating row as IGDB returns it. IGDB moved ratings to `organization` + `rating_category` (the category's
 * `rating` is a label like "AO") and deprecated the numeric `category` (1 = ESRB) and `rating` (12 = Adults Only);
 * either shape may come back, so both are read. */
export interface IgdbAgeRating {
  organization?: { name?: string } | number | null;
  rating_category?: { rating?: string } | number | null;
  category?: number | null;
  rating?: number | null;
}

/** True when any rating is ESRB "Adults Only" - the one rating that means an adult-only title (PEGI 18 and ESRB
 * Mature also cover plenty of mainstream games, so they are not used). */
export function hasEsrbAdultsOnly(ratings: IgdbAgeRating[] | null | undefined): boolean {
  if (!Array.isArray(ratings)) return false;
  return ratings.some((r) => {
    if (!r || typeof r !== 'object') return false;
    const org = typeof r.organization === 'object' && r.organization ? r.organization.name : undefined;
    const label = typeof r.rating_category === 'object' && r.rating_category ? r.rating_category.rating : undefined;
    if (typeof org === 'string' && typeof label === 'string') return org.trim().toUpperCase() === 'ESRB' && label.trim().toUpperCase() === 'AO';
    return r.category === 1 && r.rating === 12; // the older numeric fields
  });
}

const ADULTS_ONLY_CACHE_PREFIX = 'igdb:esrb-ao:v1:';

/** Whether IGDB lists an ESRB Adults Only rating for this game. Cached for 30 days. Null when IGDB could not be
 * asked or did not understand the question, so the caller can carry on and try again later. */
export async function getIgdbAdultsOnly(igdbId: number): Promise<boolean | null> {
  if (!Number.isInteger(igdbId) || igdbId <= 0) return null;
  try {
    const cached = await redis.get(ADULTS_ONLY_CACHE_PREFIX + igdbId);
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch {
    /* an unreadable cache is just asked again */
  }
  try {
    const rows = await igdbRequest<Array<{ age_ratings?: IgdbAgeRating[] }>>(
      'games',
      `fields age_ratings.organization.name, age_ratings.rating_category.rating, age_ratings.category, age_ratings.rating; where id = ${igdbId};`,
    );
    const adult = hasEsrbAdultsOnly(rows[0]?.age_ratings);
    await redis.set(ADULTS_ONLY_CACHE_PREFIX + igdbId, adult ? '1' : '0', 'EX', 30 * 24 * 60 * 60).catch(() => undefined);
    return adult;
  } catch {
    return null;
  }
}

const STEAM_APP_ID_LOOKUP_CACHE_PREFIX = 'igdb:steam-appid-to-igdbid:v1:';
const STEAM_APP_ID_LOOKUP_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h — this mapping essentially never changes
const EXACT_TITLE_LOOKUP_CACHE_PREFIX = 'igdb:exact-title:v1:';

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

/** Strips trademark/registered/copyright marks and collapses whitespace before a title comparison
 * (issue #387) - Steam's Web API frequently returns a library game's name with a literal ™ or ®
 * baked in (e.g. "Wolfenstein®: The New Order") even though the storefront/library UI cosmetically
 * strips it, while IGDB's title for the same game never carries one. findIgdbIdByExactTitle's
 * match previously required byte-for-byte equality after only trim+lowercase, so every Steam title
 * carrying one of these marks silently failed to match its otherwise-identical IGDB entry - seen
 * with several older Bethesda/id Software titles (the Wolfenstein reissues in particular). */
export function normalizeGameTitleForComparison(title: string): string {
  return title
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Storefront "edition" qualifiers publishers tack onto a re-release's name (issue #491) - EA and
 * Ubisoft in particular ship a Steam library entry like "Battlefield 4 Premium Edition" or
 * "Assassin's Creed Valhalla - Gold Edition" that has no IGDB entry of its own, so an exact-title
 * search for the full Steam name comes up empty even though the base game is already on IGDB
 * under its plain title. Ordered longest-phrase-first so e.g. "game of the year" isn't left
 * partially matched by a shorter alternative. */
const EDITION_CORE_WORDS =
  "game of the year|goty|director'?s cut|definitive|deluxe|ultimate|complete|gold|legendary|anniversary|enhanced|premium|special|extended|year one|standard";
const EDITION_SUFFIX_RE = new RegExp(
  `[\\s:,\\-(]+(?:${EDITION_CORE_WORDS})(?:\\s+(?:edition|bundle|pass|cut))?\\)?\\s*$`,
  'i',
);

/** Strips a trailing edition qualifier (see EDITION_CORE_WORDS above) off a game title, repeatedly
 * in case more than one is stacked (e.g. "... Ultimate - Gold Edition"). Requires the qualifier to
 * be preceded by a separator character, not just anchored to the end of the string, so a title
 * that's *only* an edition name (nothing to strip it down to) is left alone rather than reduced to
 * an empty string. */
export function stripEditionSuffix(title: string): string {
  let result = title.trim();
  let previous: string;
  do {
    previous = result;
    result = result.replace(EDITION_SUFFIX_RE, '').trim();
  } while (result !== previous && result.length > 0);
  return result;
}

async function searchExactTitle(title: string): Promise<number | null> {
  const escaped = escapeApicalypseString(title);
  const games = await igdbRequest<IgdbGame[]>(
    'games',
    `search "${escaped}"; fields name,version_parent; limit ${SEARCH_FIRST_PAGE_RAW_LIMIT};`,
  );
  const normalized = normalizeGameTitleForComparison(title);
  const match = games.find((g) => g.name && normalizeGameTitleForComparison(g.name) === normalized);
  if (!match) return null;
  return match.version_parent ?? match.id;
}

/** Fallback for findIgdbIdBySteamAppId when IGDB's external_games has no Steam link at all for a
 * title (issue #373) - that table is crowd-sourced and can simply never get filled in for a game
 * that's genuinely live on Steam right now (the same gap findSteamAppIdByTitle already works
 * around in the other direction, for pricing). Searches IGDB by the Steam library's own game name
 * and only trusts an exact (case-insensitive, trademark-mark-insensitive - see
 * normalizeGameTitleForComparison) title match against *any* of the raw results, not just IGDB's
 * top-ranked one - same reasoning as sortExactMatchFirst's exact tier, but applied as a hard filter
 * here since silently picking the wrong edition/spinoff would be worse than skipping the import
 * (the caller falls back to leaving the game unimported, same as a true no-match).
 *
 * If that exact match fails, retries once against the title with a trailing edition qualifier
 * stripped (issue #491, see stripEditionSuffix) - so a Steam library entry like "Borderlands: Game
 * of the Year Edition" resolves to the same canonical id as a plain "Borderlands" copy instead of
 * being skipped as unmatched or, worse, imported as a second, unlinked row for the same game. */
export async function findIgdbIdByExactTitle(title: string): Promise<number | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;

  // Cached (a miss included) for the same reason as findIgdbIdBySteamAppId: a Steam library sync
  // re-considers every owned game that isn't on the shelf yet, so without this each sync re-ran one
  // or two IGDB searches for every soundtrack/tool/demo IGDB will never match - minutes per sync
  // on a big library.
  const cacheKey = EXACT_TITLE_LOOKUP_CACHE_PREFIX + normalizeGameTitleForComparison(trimmed);
  const cached = await redis.get(cacheKey);
  if (cached) return cached === 'null' ? null : Number(cached);

  let igdbId = await searchExactTitle(trimmed);
  if (igdbId === null) {
    const stripped = stripEditionSuffix(trimmed);
    if (stripped && stripped.toLowerCase() !== trimmed.toLowerCase()) igdbId = await searchExactTitle(stripped);
  }

  await redis.set(cacheKey, igdbId === null ? 'null' : String(igdbId), 'EX', STEAM_APP_ID_LOOKUP_CACHE_TTL_SECONDS);
  return igdbId;
}

/** The IGDB genre names a plain-language search may filter by (issue #823). The AI may only pick
 * from these, so a made-up genre can never reach a query. */
export const IGDB_GENRE_NAMES = [
  'Point-and-click', 'Fighting', 'Shooter', 'Music', 'Platform', 'Puzzle', 'Racing', 'Real Time Strategy (RTS)', 'Role-playing (RPG)', 'Simulator',
  'Sport', 'Strategy', 'Turn-based strategy (TBS)', 'Tactical', "Hack and slash/Beat 'em up", 'Quiz/Trivia', 'Pinball', 'Adventure', 'Indie', 'Arcade',
  'Visual Novel', 'Card & Board Game', 'MOBA',
] as const;

const DISCOVER_RAW_LIMIT = 50;
const DISCOVER_RESULT_LIMIT = 20;
const yearStartSeconds = (year: number) => Math.floor(Date.UTC(year, 0, 1) / 1000);

/** What a plain-language search was understood as: the app's own filters plus an IGDB text query.
 * Every value is one the app supports (see parseSearchFilters), never a game. */
export interface DiscoverFilters {
  query: string | null;
  platforms: RoomPlatform[];
  coop: boolean;
  genres: string[];
  maxHours: number | null;
  releasedFrom: number | null;
  releasedTo: number | null;
}

/** Pure: the Apicalypse body for a filtered browse. With a text query it uses IGDB's `search` (which
 * cannot be sorted); without one it lists the best-rated games that match. Only validated values are
 * ever placed in the query: genres from IGDB_GENRE_NAMES, whole numbers for years, platforms from the
 * app's platform names, and the free text escaped. */
export function buildDiscoverQuery(filters: DiscoverFilters, platforms: RoomPlatform[], limit = DISCOVER_RAW_LIMIT): string {
  const where: string[] = [];
  const active = filters.platforms.length > 0 ? filters.platforms : platforms;
  if (active.length > 0) {
    const names = withBackwardsCompatible(active).flatMap((p) => IGDB_PLATFORM_NAMES[p]).map((n) => `"${n}"`).join(',');
    where.push(`platforms.name = (${names})`);
  }
  if (filters.coop) where.push('game_modes.name = ("Co-operative")');
  const genres = filters.genres.filter((g) => (IGDB_GENRE_NAMES as readonly string[]).includes(g));
  if (genres.length > 0) where.push(`genres.name = (${genres.map((g) => `"${escapeApicalypseString(g)}"`).join(',')})`);
  if (filters.releasedFrom !== null && Number.isInteger(filters.releasedFrom)) where.push(`first_release_date >= ${yearStartSeconds(filters.releasedFrom)}`);
  if (filters.releasedTo !== null && Number.isInteger(filters.releasedTo)) where.push(`first_release_date < ${yearStartSeconds(filters.releasedTo + 1)}`);
  const text = filters.query?.trim();
  if (!text) where.push('total_rating_count > 0');
  const fields = 'fields name,cover.image_id,platforms.name,first_release_date,category,version_parent;';
  const whereClause = where.length ? ` where ${where.join(' & ')};` : '';
  return text
    ? `search "${escapeApicalypseString(text)}"; ${fields}${whereClause} limit ${limit};`
    : `${fields}${whereClause} sort total_rating_count desc; limit ${limit};`;
}

/** Of these games, the ids whose main-story time to beat is known and at most `maxHours`. One IGDB call. */
async function idsWithinHours(ids: number[], maxHours: number): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await igdbRequest<{ game_id: number; normally?: number }[]>('game_time_to_beats', `fields game_id,normally; where game_id = (${ids.join(',')}); limit ${ids.length};`);
  return new Set(rows.filter((r) => typeof r.normally === 'number' && r.normally <= maxHours * 3600).map((r) => r.game_id));
}

/** A filtered browse for the plain-language search (issue #823): the same primary-edition, add-on and
 * already-added rules as the normal search, then the time-to-beat limit (games with no known length
 * are left out, since "short" cannot be claimed without data). */
export async function discoverGames(filters: DiscoverFilters, scopePlatforms: RoomPlatform[], excludeIgdbIds?: Set<number>): Promise<GameSearchResult[]> {
  const games = await igdbRequest<IgdbGame[]>('games', buildDiscoverQuery(filters, scopePlatforms));
  const active = filters.platforms.length > 0 ? filters.platforms : scopePlatforms;
  const playable = active.length > 0 ? withBackwardsCompatible(active) : null;
  let kept = games
    .filter((g) => g.name)
    .filter(isPrimaryEdition)
    .filter((g) => !isAddonEdition(g))
    .filter((g) => !playable || platformFamilies(g.platforms).some((f) => playable.includes(f)))
    .filter((g) => !excludeIgdbIds || !excludeIgdbIds.has(g.id));
  if (filters.maxHours !== null && kept.length > 0) {
    const within = await idsWithinHours(kept.map((g) => g.id), filters.maxHours);
    kept = kept.filter((g) => within.has(g.id));
  }
  return kept.slice(0, DISCOVER_RESULT_LIMIT).map((g) => ({
    igdbId: g.id,
    title: g.name!,
    platform: platformLabel(g.platforms),
    coverImageUrl: coverUrl(g.cover),
    releaseYear: releaseYear(g.first_release_date),
  }));
}
