import { HttpError } from '../util/httpError.js';
import { redis } from './redisClient.js';
import type { SteamImportProgress, SteamWishlistImportProgress } from '@queueup/shared';

const STEAM_SUB_PREFIX = 'steam:';

/** Steam is a User.oidcSub of the form "steam:{steamId64}" (see steamProvider.ts). Returns null
 * for anyone who didn't sign in with Steam - they have nothing to import a library from. */
export function extractSteamId64(oidcSub: string): string | null {
  return oidcSub.startsWith(STEAM_SUB_PREFIX) ? oidcSub.slice(STEAM_SUB_PREFIX.length) : null;
}

/** A user's Steam ID can come from either signing in with Steam directly (oidcSub) or linking a
 * Steam account while signed in some other way (User.steamId64, see the link flow in auth.ts).
 * This is the single place that should be used to decide "does this user have a usable Steam
 * account" - callers shouldn't read oidcSub or steamId64 individually. */
export function resolveSteamId64(user: { oidcSub: string; steamId64: string | null }): string | null {
  return user.steamId64 ?? extractSteamId64(user.oidcSub);
}

interface SteamStoreSearchItem {
  type: string;
  name: string;
  id: number;
}

interface SteamStoreSearchResponse {
  items?: SteamStoreSearchItem[];
}

/** Public, unauthenticated Steam store search - no API key needed, unlike everything else in this
 * file. Used as a fallback when IGDB's external_games has no Steam link for a title at all - that
 * table is crowd-sourced and can simply never get filled in for a given game, even one that's
 * genuinely live on Steam right now (seen with Borderlands 4 shortly after this was written), so
 * waiting for IGDB to catch up isn't a reliable fix on its own. Only trusts an exact
 * (case-insensitive) title match against a Steam "app" result - anything looser risks matching a
 * DLC, soundtrack, or demo listing instead of the base game. */
export async function findSteamAppIdByTitle(title: string): Promise<number | null> {
  const url = new URL('https://store.steampowered.com/api/storesearch/');
  url.searchParams.set('term', title);
  url.searchParams.set('l', 'english');
  url.searchParams.set('cc', 'us');

  const response = await fetch(url);
  if (!response.ok) return null;

  const body = (await response.json()) as SteamStoreSearchResponse;
  const normalized = title.trim().toLowerCase();
  const match = body.items?.find((item) => item.type === 'app' && item.name.trim().toLowerCase() === normalized);
  return match?.id ?? null;
}

interface SteamOwnedGame {
  appid: number;
  playtime_forever: number;
}

interface SteamOwnedGamesResponse {
  response?: { games?: SteamOwnedGame[] };
}

export interface OwnedSteamGame {
  appId: number;
  playtimeForeverMinutes: number;
}

/** Fetches every game a Steam account owns via the Steam Web API. Requires the account's Steam
 * privacy setting to expose its game list publicly (the same requirement as any third-party Steam
 * tool) - a private profile returns an empty list rather than an error. */
export async function getOwnedSteamGames(steamId64: string, apiKey: string): Promise<OwnedSteamGame[]> {
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamid', steamId64);
  url.searchParams.set('include_appinfo', 'false');
  url.searchParams.set('include_played_free_games', 'true');
  url.searchParams.set('format', 'json');

  const response = await fetch(url);
  if (!response.ok) {
    throw new HttpError(502, `Could not reach Steam (${response.status})`);
  }
  const body = (await response.json()) as SteamOwnedGamesResponse;
  const games = body.response?.games ?? [];
  return games.map((g) => ({ appId: g.appid, playtimeForeverMinutes: g.playtime_forever }));
}

interface SteamWishlistItem {
  appid: number;
}

interface SteamWishlistResponse {
  response?: { items?: SteamWishlistItem[] };
}

/** Fetches every AppID on a Steam account's wishlist (issue #228). Same privacy requirement as
 * getOwnedSteamGames - a private wishlist returns an empty list rather than an error. */
export async function getWishlistAppIds(steamId64: string, apiKey: string): Promise<number[]> {
  const url = new URL('https://api.steampowered.com/IWishlistService/GetWishlist/v1/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamid', steamId64);
  url.searchParams.set('format', 'json');

  const response = await fetch(url);
  if (!response.ok) {
    throw new HttpError(502, `Could not reach Steam (${response.status})`);
  }
  const body = (await response.json()) as SteamWishlistResponse;
  return (body.response?.items ?? []).map((item) => item.appid);
}

interface SteamAchievementEntry {
  achieved: 0 | 1;
}

interface SteamPlayerAchievementsResponse {
  playerstats?: { success: boolean; achievements?: SteamAchievementEntry[] };
}

export interface SteamAchievementCounts {
  unlocked: number;
  total: number;
}

// Achievement progress doesn't need real-time freshness - this just keeps repeatedly opening the
// same game's modal (or a roomful of members all opening it) from re-hitting Steam every time.
const ACHIEVEMENTS_CACHE_TTL_SECONDS = 60 * 30;

function achievementsCacheKey(steamId64: string, appId: number): string {
  return `steam-achievements:${steamId64}:${appId}`;
}

/** Fetches one Steam account's unlocked/total achievement count for one game. Returns null if the
 * game has no achievements defined, or the account's "game details" privacy is set to private
 * (both surface identically from Steam as `success: false`, with no way to tell them apart) -
 * either way, "nothing to show here" is a real answer worth caching. A network error or non-OK
 * response is a different fact (we don't know the answer, not "the answer is nothing") and must
 * NOT be cached, or a transient Steam outage would get frozen in as "no achievements" for every
 * game/account combination it touched, for the full TTL, well after Steam recovers. */
export async function getAchievementCounts(steamId64: string, appId: number, apiKey: string): Promise<SteamAchievementCounts | null> {
  const cacheKey = achievementsCacheKey(steamId64, appId);
  const cached = await redis.get(cacheKey);
  if (cached !== null) return JSON.parse(cached) as SteamAchievementCounts | null;

  const url = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamid', steamId64);
  url.searchParams.set('appid', String(appId));
  url.searchParams.set('format', 'json');

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    // Same as getOwnedSteamGames above - a Steam Web API hiccup shouldn't block the rest of the
    // modal from rendering. Unlike that function, this one is expected to fail soft (return null)
    // rather than throw, but still must not cache this outcome (see doc comment above).
    return null;
  }
  if (!response.ok) return null;

  const body = (await response.json()) as SteamPlayerAchievementsResponse;
  // A successful response lists every achievement the game defines, achieved or not - no
  // separate schema lookup needed to know the total.
  const achievements = body.playerstats?.success ? (body.playerstats.achievements ?? []) : [];
  const counts: SteamAchievementCounts | null =
    achievements.length > 0
      ? { unlocked: achievements.filter((a) => a.achieved === 1).length, total: achievements.length }
      : null;

  await redis.set(cacheKey, JSON.stringify(counts), 'EX', ACHIEVEMENTS_CACHE_TTL_SECONDS);
  return counts;
}

interface SteamAchievementDetailEntry {
  apiname: string;
  achieved: 0 | 1;
  unlocktime: number;
  /** Only present when the request includes `l=<language>` - the display title, as opposed to
   * apiname's internal identifier. Missing/empty for a vanishingly small number of games whose
   * schema data Steam doesn't have localized. */
  name?: string;
}

interface SteamPlayerAchievementDetailsResponse {
  playerstats?: { success: boolean; achievements?: SteamAchievementDetailEntry[] };
}

export interface SteamUnlockedAchievement {
  apiname: string;
  displayName: string;
  /** Unix seconds. */
  unlockTime: number;
}

const ACHIEVEMENT_DETAILS_CACHE_TTL_SECONDS = 60 * 30;

function achievementDetailsCacheKey(steamId64: string, appId: number): string {
  return `steam-achievement-details:${steamId64}:${appId}`;
}

/** Same data source as getAchievementCounts, but keeps the unlocked achievements themselves
 * (name + unlock time) instead of collapsing them to a count - used for the Year in Review recap's
 * "achievements gathered" and "rarest achievements" sections. Kept as a separate function/cache
 * namespace rather than folding into getAchievementCounts so that function's existing shape/cache
 * entries are untouched. Returns an empty array on any failure/no-data case, same reasoning as
 * getAchievementCounts (nothing to show is not an error worth surfacing), and - per the transient-
 * failure bug fixed there - never caches on a network error or non-ok response, only on an actual
 * answer from Steam. */
export async function getAchievementDetails(
  steamId64: string,
  appId: number,
  apiKey: string,
): Promise<SteamUnlockedAchievement[]> {
  const cacheKey = achievementDetailsCacheKey(steamId64, appId);
  const cached = await redis.get(cacheKey);
  if (cached !== null) return JSON.parse(cached) as SteamUnlockedAchievement[];

  const url = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamid', steamId64);
  url.searchParams.set('appid', String(appId));
  url.searchParams.set('l', 'english');
  url.searchParams.set('format', 'json');

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return [];
  }
  if (!response.ok) return [];

  const body = (await response.json()) as SteamPlayerAchievementDetailsResponse;
  const achievements = body.playerstats?.success ? (body.playerstats.achievements ?? []) : [];
  const unlocked: SteamUnlockedAchievement[] = achievements
    .filter((a) => a.achieved === 1)
    .map((a) => ({ apiname: a.apiname, displayName: a.name || a.apiname, unlockTime: a.unlocktime }));

  await redis.set(cacheKey, JSON.stringify(unlocked), 'EX', ACHIEVEMENT_DETAILS_CACHE_TTL_SECONDS);
  return unlocked;
}

interface SteamGlobalAchievementPercentagesResponse {
  achievementpercentages?: { achievements?: { name: string; percent: number }[] };
}

const GLOBAL_ACHIEVEMENT_RARITY_CACHE_TTL_SECONDS = 60 * 60 * 12; // community-wide unlock rates barely move day to day

function globalAchievementRarityCacheKey(appId: number): string {
  return `steam-achievement-rarity:${appId}`;
}

/** The community-wide unlock percentage for every achievement a game defines - public Steam data,
 * no API key or steamid needed. Used to figure out which of a player's unlocked achievements are
 * the "rarest" (lowest global unlock %) for the Year in Review recap. Returns an empty map on any
 * failure, same not-caching-transient-failures reasoning as getAchievementDetails. */
export async function getGlobalAchievementRarity(appId: number): Promise<Map<string, number>> {
  const cacheKey = globalAchievementRarityCacheKey(appId);
  const cached = await redis.get(cacheKey);
  if (cached !== null) return new Map(JSON.parse(cached) as [string, number][]);

  const url = new URL('https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/');
  url.searchParams.set('gameid', String(appId));
  url.searchParams.set('format', 'json');

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return new Map();
  }
  if (!response.ok) return new Map();

  const body = (await response.json()) as SteamGlobalAchievementPercentagesResponse;
  const entries = body.achievementpercentages?.achievements ?? [];
  const rarity = new Map(entries.map((a) => [a.name, a.percent] as const));

  await redis.set(cacheKey, JSON.stringify(Array.from(rarity.entries())), 'EX', GLOBAL_ACHIEVEMENT_RARITY_CACHE_TTL_SECONDS);
  return rarity;
}

const IMPORT_PROGRESS_TTL_SECONDS = 60 * 10; // covers the slowest realistic import plus a buffer for the client's last poll

function importProgressKey(userId: string): string {
  return `steam-import-progress:${userId}`;
}

/** Written to as the import loop in routes/games.ts processes each game, and polled by
 * SteamImportCard so a slow import (one IGDB lookup per unowned game) shows live counts instead of
 * a bare "Importing…" for however long the whole batch takes. */
export async function setSteamImportProgress(userId: string, progress: SteamImportProgress): Promise<void> {
  await redis.set(importProgressKey(userId), JSON.stringify(progress), 'EX', IMPORT_PROGRESS_TTL_SECONDS);
}

export async function getSteamImportProgress(userId: string): Promise<SteamImportProgress | null> {
  const cached = await redis.get(importProgressKey(userId));
  return cached ? (JSON.parse(cached) as SteamImportProgress) : null;
}

// Same ceiling as the progress TTL above - long enough to cover the slowest realistic import,
// short enough that a crashed run doesn't lock a user out of retrying indefinitely.
const IMPORT_LOCK_TTL_SECONDS = IMPORT_PROGRESS_TTL_SECONDS;

function importLockKey(userId: string): string {
  return `steam-import-lock:${userId}`;
}

/** Guards against two overlapping library imports for the same user - e.g. a retried click after
 * a slow reverse proxy/CDN times out the first request (see routes/games.ts), or two open tabs.
 * Without this, each run independently snapshots "what's already on the shelf" when it starts, so
 * two overlapping runs can both decide the same Steam games are new and both create them,
 * producing duplicates. Returns true if the lock was acquired (caller may proceed), false if
 * another import is already running - always pair a true result with releaseSteamImportLock. */
export async function acquireSteamImportLock(userId: string): Promise<boolean> {
  const result = await redis.set(importLockKey(userId), '1', 'EX', IMPORT_LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

export async function releaseSteamImportLock(userId: string): Promise<void> {
  await redis.del(importLockKey(userId));
}

function wishlistImportProgressKey(userId: string): string {
  return `steam-wishlist-import-progress:${userId}`;
}

/** Wishlist counterpart to setSteamImportProgress/getSteamImportProgress above (issue #245) - same
 * reasoning, separate Redis key so a library import and a wishlist import running for the same
 * user at once don't clobber each other's progress. */
export async function setSteamWishlistImportProgress(userId: string, progress: SteamWishlistImportProgress): Promise<void> {
  await redis.set(wishlistImportProgressKey(userId), JSON.stringify(progress), 'EX', IMPORT_PROGRESS_TTL_SECONDS);
}

export async function getSteamWishlistImportProgress(userId: string): Promise<SteamWishlistImportProgress | null> {
  const cached = await redis.get(wishlistImportProgressKey(userId));
  return cached ? (JSON.parse(cached) as SteamWishlistImportProgress) : null;
}

function wishlistImportLockKey(userId: string): string {
  return `steam-wishlist-import-lock:${userId}`;
}

/** Wishlist counterpart to acquireSteamImportLock/releaseSteamImportLock above (issue #245) - same
 * reasoning, separate key so it only guards against two overlapping wishlist imports rather than
 * also blocking on (or being blocked by) an in-flight library import for the same user. */
export async function acquireSteamWishlistImportLock(userId: string): Promise<boolean> {
  const result = await redis.set(wishlistImportLockKey(userId), '1', 'EX', IMPORT_LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

export async function releaseSteamWishlistImportLock(userId: string): Promise<void> {
  await redis.del(wishlistImportLockKey(userId));
}
