import type { LibraryImportEntry, RoomPlatform } from '@queueup/shared';
import { PsnAuthError } from './psnAuth.js';

/** Reads a person's purchased PlayStation games: the same GraphQL "persisted query" PlayStation's own
 * library page (library.playstation.com) uses, as found by the open-source `psn-api` package
 * (https://github.com/achievements-app/psn-api, MIT licence). It returns PS4 and PS5 games only; PS3
 * and Vita titles, and PS Plus catalogue games that were never purchased, are not in it.
 *
 * The query is identified by a hash of Sony's own query text. Sony can change it at any time, which
 * is reported as "PlayStation changed something" rather than as an empty library. */

const GRAPHQL_URL = 'https://web.np.playstation.com/api/graphql/v1/op';
const PURCHASED_GAMES_HASH = '827a423f6a8ddca4107ac01395af2ec0eafd8396fc7fa204aaf9b7ed2eefa168';
// 24 is the page size psn-api uses by default; larger sizes are not known to be accepted.
const PAGE_SIZE = 24;
/** A hard stop, well above any real library, so a misbehaving response can't loop forever. */
const MAX_PAGES = 400;
const REQUEST_TIMEOUT_MS = 20_000;

interface PurchasedGame {
  name?: string;
  platform?: string;
  isActive?: boolean;
}

const PLATFORMS: Record<string, RoomPlatform> = { PS5: 'ps5', PS4: 'ps4' };

/** Turns purchased games into import entries: one per title, with every PlayStation platform it was
 * bought for (a game owned as both the PS4 and PS5 version is one entry on both). */
export function gamesToEntries(games: PurchasedGame[]): LibraryImportEntry[] {
  const byTitle = new Map<string, Set<RoomPlatform>>();
  for (const g of games) {
    const title = typeof g?.name === 'string' ? g.name.trim() : '';
    const platform = typeof g?.platform === 'string' ? PLATFORMS[g.platform.toUpperCase()] : undefined;
    if (!title || !platform) continue;
    const set = byTitle.get(title) ?? new Set<RoomPlatform>();
    set.add(platform);
    byTitle.set(title, set);
  }
  return [...byTitle.entries()].map(([title, platforms]) => ({ title, platforms: [...platforms] }));
}

type Fetch = typeof fetch;

async function fetchPage(accessToken: string, start: number, fetchImpl: Fetch): Promise<PurchasedGame[]> {
  const url = new URL(GRAPHQL_URL);
  url.searchParams.set('operationName', 'getPurchasedGameList');
  url.searchParams.set(
    'variables',
    JSON.stringify({ isActive: true, platform: ['ps4', 'ps5'], size: PAGE_SIZE, start, sortBy: 'ACTIVE_DATE', sortDirection: 'desc' }),
  );
  url.searchParams.set('extensions', JSON.stringify({ persistedQuery: { version: 1, sha256Hash: PURCHASED_GAMES_HASH } }));

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PsnAuthError('Could not reach PlayStation. Try again in a moment.');
  }
  if (res.status === 401 || res.status === 403) throw new PsnAuthError('PlayStation refused the request. Link your PlayStation account again.', true);
  if (res.status >= 500) throw new PsnAuthError('PlayStation is having problems right now. Try again later.');
  const body = (await res.json().catch(() => null)) as { data?: { purchasedTitlesRetrieve?: { games?: PurchasedGame[] } } } | null;
  const games = body?.data?.purchasedTitlesRetrieve?.games;
  if (!Array.isArray(games)) {
    // Sony changing the query or its hash looks like this: a valid reply with no list in it.
    throw new PsnAuthError('PlayStation changed how its library is read, so QueueUp can\'t read it right now. This needs an update to QueueUp.');
  }
  return games;
}

/** Every purchased PS4 and PS5 game, page by page. */
export async function fetchPurchasedLibrary(accessToken: string, fetchImpl: Fetch = fetch): Promise<LibraryImportEntry[]> {
  const all: PurchasedGame[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const games = await fetchPage(accessToken, page * PAGE_SIZE, fetchImpl);
    all.push(...games);
    if (games.length < PAGE_SIZE) break;
  }
  return gamesToEntries(all);
}
