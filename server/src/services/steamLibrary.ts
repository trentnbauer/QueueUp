import { HttpError } from '../util/httpError.js';
import { redis } from './redisClient.js';
import type { SteamImportProgress } from '@queueup/shared';

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
