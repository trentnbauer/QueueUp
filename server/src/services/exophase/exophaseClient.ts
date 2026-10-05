import type { LibraryImportEntry, RoomPlatform } from '@queueup/shared';

/** Reads a person's public Exophase profile. Exophase gathers libraries from PlayStation, Xbox,
 * Steam, Epic, GOG and more, and its own website loads them from a JSON endpoint keyed by the
 * profile's numeric player id. That endpoint is not a documented public API (Exophase has said it
 * has none), so this can break or be blocked without notice; every failure here is turned into a
 * message a person can act on rather than a crash. Only public profile data is read, and nothing is
 * stored beyond the player id. Plain HTTPS with an injectable `fetch`, so it tests without a network. */

const API = 'https://api.exophase.com/public/player';
const SITE = 'https://www.exophase.com';
const REQUEST_TIMEOUT_MS = 15_000;
/** One request per page; a polite pause between pages keeps a big library from hammering the site. */
const PAGE_DELAY_MS = 250;
/** A hard stop, well above any real library, so a misbehaving response can't loop forever. */
const MAX_PAGES = 200;
const HEADERS = {
  'user-agent': 'QueueUp (self-hosted game backlog; https://github.com/trentnbauer/QueueUp)',
  accept: 'application/json, text/plain, */*',
  referer: `${SITE}/`,
};

export class ExophaseError extends Error {
  constructor(
    message: string,
    /** Exophase is refusing requests from this server (blocked or rate limited): leave it alone for a while. */
    readonly rateLimited = false,
  ) {
    super(message);
    this.name = 'ExophaseError';
  }
}

interface ExophaseGame {
  meta?: { title?: string; platforms?: { name?: string }[] };
}

/** Exophase's platform names, mapped to the platforms QueueUp tracks. Console generations are only
 * mapped when the name says which one (a bare "Xbox" is left out rather than guessed), every PC
 * store counts as PC, and anything else (mobile, RetroAchievements) is ignored. */
export function platformsFromNames(names: string[]): RoomPlatform[] {
  const found = new Set<RoomPlatform>();
  for (const raw of names) {
    const n = raw.toLowerCase();
    if (/\bps ?5\b|playstation 5/.test(n)) found.add('ps5');
    else if (/\bps ?4\b|playstation 4/.test(n)) found.add('ps4');
    else if (/\bps ?3\b|playstation 3/.test(n)) found.add('ps3');
    else if (/vita/.test(n)) found.add('vita');
    else if (/xbox series/.test(n)) found.add('xbox_series');
    else if (/xbox one/.test(n)) found.add('xbox_one');
    else if (/xbox 360/.test(n)) found.add('xbox_360');
    else if (/switch ?2/.test(n)) found.add('switch2');
    else if (/switch/.test(n)) found.add('switch');
    else if (/steam|epic|gog|ubisoft|uplay|\bea\b|origin|blizzard|battle\.net|windows|\bpc\b/.test(n)) found.add('pc');
  }
  return [...found];
}

/** Turns Exophase games into import entries: one per title, with every platform it was found on.
 * Titles with no platform QueueUp tracks are left out, since there would be nothing to mark owned. */
export function gamesToEntries(games: ExophaseGame[]): LibraryImportEntry[] {
  const byTitle = new Map<string, Set<RoomPlatform>>();
  for (const g of games) {
    const title = typeof g?.meta?.title === 'string' ? g.meta.title.trim() : '';
    if (!title) continue;
    const names = (Array.isArray(g.meta?.platforms) ? g.meta!.platforms! : []).map((p) => (typeof p?.name === 'string' ? p.name : '')).filter(Boolean);
    const platforms = platformsFromNames(names);
    if (platforms.length === 0) continue;
    const set = byTitle.get(title) ?? new Set<RoomPlatform>();
    for (const p of platforms) set.add(p);
    byTitle.set(title, set);
  }
  return [...byTitle.entries()].map(([title, platforms]) => ({ title, platforms: [...platforms] }));
}

type Fetch = typeof fetch;

async function getJson(url: string, fetchImpl: Fetch): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new ExophaseError('Could not reach Exophase. Try again in a moment.');
  }
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** One page of a player's games. `null` when Exophase says there is nothing (no profile, a private
 * one, or the end of the list). */
export async function fetchGamesPage(playerId: string, page: number, fetchImpl: Fetch = fetch): Promise<ExophaseGame[] | null> {
  const { status, body } = await getJson(`${API}/${encodeURIComponent(playerId)}/games?page=${page}&environment=&sort=1&showHidden=0`, fetchImpl);
  if (status === 403 || status === 429) throw new ExophaseError('Exophase is blocking requests from this server right now. Try again later.', true);
  if (status >= 500) throw new ExophaseError('Exophase is having problems right now. Try again later.');
  const data = body as { success?: boolean; games?: ExophaseGame[] } | null;
  if (status !== 200 || !data?.success || !Array.isArray(data.games) || data.games.length === 0) return null;
  return data.games;
}

/** Works out a player id from what a person gave: a number, a profile link, or a profile name. A
 * link or name is turned into the id by reading the profile page, which carries it in its source. */
export async function resolvePlayerId(input: string, fetchImpl: Fetch = fetch): Promise<string> {
  const text = input.trim();
  if (/^\d{1,12}$/.test(text)) return text;

  const fromLink = text.match(/exophase\.com\/(?:[a-z]{2}\/)?(?:user|profile)\/([^/?#\s]+)/i);
  const name = fromLink ? decodeURIComponent(fromLink[1]) : /^[\w.\-]{2,40}$/.test(text) ? text : null;
  if (!name) {
    throw new ExophaseError('That does not look like an Exophase profile link, profile name or player id.');
  }

  let res: Response;
  try {
    res = await fetchImpl(`${SITE}/user/${encodeURIComponent(name)}/`, { headers: { ...HEADERS, accept: 'text/html' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new ExophaseError('Could not reach Exophase. Try again in a moment.');
  }
  const html = res.ok ? await res.text().catch(() => '') : '';
  const id = html.match(/window\.playerProfileId\s*=\s*["']?(\d+)/)?.[1];
  if (!id) {
    throw new ExophaseError('Could not read that profile. Check the profile is public, or paste the number from your profile page\'s source (search it for "playerProfileId").');
  }
  return id;
}

/** Every game on the profile, page by page. Throws when the profile has none to read. */
export async function fetchLibrary(
  playerId: string,
  fetchImpl: Fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<LibraryImportEntry[]> {
  const all: ExophaseGame[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const games = await fetchGamesPage(playerId, page, fetchImpl);
    if (!games) break;
    all.push(...games);
    await sleep(PAGE_DELAY_MS);
  }
  if (all.length === 0) {
    throw new ExophaseError('No games found on that Exophase profile. Check the profile is public and has games.');
  }
  return gamesToEntries(all);
}
