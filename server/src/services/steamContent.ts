import { redis } from './redisClient.js';

/** Steam as a second source for "this is an adult game" (next to IGDB's Erotic theme and keywords). A store page's
 * content descriptors include id 3, "Adult Only Sexual Content", which publishers must set for adult-only
 * titles. Mainstream games with some nudity or sexual material (The Witcher 3, Cyberpunk 2077, Baldur's Gate 3)
 * carry descriptor 1 or 5 but not 3, so only 3 counts: it is a clear signal and rarely a false alarm. */
export const STEAM_ADULT_ONLY_DESCRIPTOR = 3;

/** True when the descriptor ids on a store page include Adult Only Sexual Content. */
export function isSteamAdultOnly(descriptorIds: unknown): boolean {
  return Array.isArray(descriptorIds) && descriptorIds.includes(STEAM_ADULT_ONLY_DESCRIPTOR);
}

const DAY = 24 * 60 * 60;
const keyOf = (appId: number) => `steam:adult-only:${appId}`;

/** Whether Steam's store page for this app is marked Adult Only Sexual Content. Cached for 30 days (a week when
 * Steam gave no answer for the app). Null when Steam could not be reached, so the caller can carry on. */
export async function getSteamAdultOnly(appId: number): Promise<boolean | null> {
  try {
    const cached = await redis.get(keyOf(appId));
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch {
    /* an unreadable cache is just fetched again */
  }
  try {
    const url = new URL('https://store.steampowered.com/api/appdetails');
    url.searchParams.set('appids', String(appId));
    url.searchParams.set('filters', 'basic,content_descriptors');
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, { success?: boolean; data?: { content_descriptors?: { ids?: unknown } } } | undefined>;
    const entry = body[String(appId)];
    const adult = isSteamAdultOnly(entry?.data?.content_descriptors?.ids);
    await redis.set(keyOf(appId), adult ? '1' : '0', 'EX', entry?.success ? 30 * DAY : 7 * DAY).catch(() => undefined);
    return adult;
  } catch {
    return null;
  }
}
