import type { LibraryImportEntry, RoomPlatform } from '@queueup/shared';
import { XboxAuthError } from './xboxAuth.js';

/** Reads a person's Xbox title history (the games they have played or own on Xbox) from Xbox Live's
 * TitleHub service and turns it into the same entries the Playnite import uses, so it goes through
 * the same matching and shelf code. TitleHub lists what the account has used, not a store purchase
 * history, so a game bought and never launched can be missing. */

const TITLEHUB = 'https://titlehub.xboxlive.com';
const REQUEST_TIMEOUT_MS = 30_000;

interface TitleHubTitle {
  name?: string;
  type?: string;
  devices?: string[];
}

/** TitleHub's device names, for the consoles QueueUp tracks. PC, mobile and the rest are left out:
 * the Xbox sync only says what is owned on a console. */
const DEVICE_PLATFORMS: Record<string, RoomPlatform> = {
  Xbox360: 'xbox_360',
  XboxOne: 'xbox_one',
  XboxSeries: 'xbox_series',
};

/** Turns TitleHub titles into import entries: real games on at least one Xbox console, one entry
 * per title, with every console it is listed on. */
export function titlesToEntries(titles: TitleHubTitle[]): LibraryImportEntry[] {
  const byTitle = new Map<string, Set<RoomPlatform>>();
  for (const t of titles) {
    const name = typeof t?.name === 'string' ? t.name.trim() : '';
    if (!name) continue;
    // Apps (Netflix, Spotify, Xbox Game Pass itself) share the history with games.
    if (t.type && t.type.toLowerCase() !== 'game') continue;
    const platforms = (Array.isArray(t.devices) ? t.devices : []).map((d) => DEVICE_PLATFORMS[d]).filter((p): p is RoomPlatform => !!p);
    if (platforms.length === 0) continue;
    const set = byTitle.get(name) ?? new Set<RoomPlatform>();
    for (const p of platforms) set.add(p);
    byTitle.set(name, set);
  }
  return [...byTitle.entries()].map(([title, platforms]) => ({ title, platforms: [...platforms] }));
}

export async function fetchXboxLibrary(
  session: { authorization: string; xuid: string },
  fetchImpl: typeof fetch = fetch,
): Promise<LibraryImportEntry[]> {
  let res: Response;
  try {
    res = await fetchImpl(`${TITLEHUB}/users/xuid(${encodeURIComponent(session.xuid)})/titles/titlehistory/decoration/detail`, {
      headers: { authorization: session.authorization, 'x-xbl-contract-version': '2', 'accept-language': 'en-US', accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new XboxAuthError('Could not reach Xbox Live. Try again in a moment.');
  }
  if (res.status === 401 || res.status === 403) throw new XboxAuthError('Xbox Live refused the request. Try again, or link your Xbox account again.', true);
  if (!res.ok) throw new XboxAuthError(`Xbox Live returned ${res.status} while reading your library. Try again later.`);
  const body = (await res.json().catch(() => null)) as { titles?: TitleHubTitle[] } | null;
  return titlesToEntries(Array.isArray(body?.titles) ? body!.titles! : []);
}
