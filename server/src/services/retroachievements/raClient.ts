import type { LibraryImportEntry, RoomPlatform } from '@queueup/shared';

/** Reads a person's RetroAchievements profile: the retro games they have played there, and which of
 * them they have beaten or mastered. Uses RetroAchievements' own web API
 * (https://api-docs.retroachievements.org), authenticated with the person's username and personal web
 * API key, the same calls the official `@retroachievements/api` library (MIT) makes. Plain HTTPS with an
 * injectable `fetch`, so it tests without a network. Every failure becomes a message a person can act on. */

const API = 'https://retroachievements.org/API';
const REQUEST_TIMEOUT_MS = 20_000;
/** The most the endpoint returns per request. */
const PAGE_SIZE = 500;
/** A hard stop, well above any real profile, so a misbehaving response can't loop forever. */
const MAX_PAGES = 100;
const PAGE_DELAY_MS = 250;

export class RetroAchievementsError extends Error {
  constructor(
    message: string,
    /** Whether the person has to enter their key again (it was rejected), as opposed to a passing failure. */
    readonly needsRelink = false,
  ) {
    super(message);
    this.name = 'RetroAchievementsError';
  }
}

export interface RaAuth {
  username: string;
  apiKey: string;
}

interface RaGame {
  Title?: string;
  ConsoleName?: string;
  HighestAwardKind?: string | null;
}

/** RetroAchievements' console names, mapped to the platforms QueueUp tracks. Matched loosely and in
 * order (more specific names first), and anything QueueUp doesn't track (arcade, DOS, handhelds from
 * other makers...) is left out rather than guessed. */
const CONSOLES: [RegExp, RoomPlatform][] = [
  [/game boy advance/, 'gba'],
  [/game boy color/, 'gbc'],
  [/game boy/, 'gb'],
  [/nintendo 3ds/, 'n3ds'],
  [/nintendo dsi?\b/, 'ds'],
  [/\bsnes\b|super famicom/, 'snes'],
  [/\bnes\b|famicom/, 'nes'],
  [/nintendo 64/, 'n64'],
  [/gamecube/, 'gamecube'],
  [/wii u/, 'wii_u'],
  [/\bwii\b/, 'wii'],
  [/playstation 2/, 'ps2'],
  [/playstation portable/, 'psp'],
  [/playstation/, 'ps1'],
  [/mega drive|genesis/, 'genesis'],
  [/master system/, 'master_system'],
  [/saturn/, 'saturn'],
  [/dreamcast/, 'dreamcast'],
];

export function platformFromConsole(consoleName: string): RoomPlatform | null {
  const name = consoleName.toLowerCase();
  return CONSOLES.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

/** Awards that mean the person has finished the game: beaten (either mode), completed or mastered. */
const FINISHED_AWARDS = new Set(['beaten-softcore', 'beaten-hardcore', 'completed', 'mastered']);

/** Tags RetroAchievements puts in front of a title for things that aren't the original game. */
const SKIPPED_TAGS = new Set(['hack', 'homebrew', 'demo', 'prototype', 'test kit', 'unlicensed']);

/** A title with RetroAchievements' bookkeeping removed, or null when it isn't a game QueueUp should
 * add: a hack, homebrew, demo or prototype (`~Hack~ Name`), or a subset of another game's achievements
 * (`Name [Subset - Bonus]`). A tag that doesn't change what the game is, such as `~Unlicensed~`
 * (an unlicensed release is still the real game), is just dropped from the title. */
export function cleanTitle(raw: string): string | null {
  let title = raw.trim();
  if (/\[subset/i.test(title)) return null;
  const tags = title.match(/^((?:~[^~]+~\s*)+)/);
  if (tags) {
    const names = [...tags[1].matchAll(/~([^~]+)~/g)].map((m) => m[1].trim().toLowerCase());
    // Unlicensed releases are real games; the others are not the original release.
    if (names.some((n) => SKIPPED_TAGS.has(n) && n !== 'unlicensed')) return null;
    title = title.slice(tags[1].length).trim();
  }
  return title || null;
}

/** Turns RetroAchievements games into import entries: one per title, with every platform it was
 * played on, flagged finished when the highest award says so. */
export function gamesToEntries(games: RaGame[]): LibraryImportEntry[] {
  const byTitle = new Map<string, { platforms: Set<RoomPlatform>; finished: boolean }>();
  for (const g of games) {
    const title = typeof g?.Title === 'string' ? cleanTitle(g.Title) : null;
    const platform = typeof g?.ConsoleName === 'string' ? platformFromConsole(g.ConsoleName) : null;
    if (!title || !platform) continue;
    const entry = byTitle.get(title) ?? { platforms: new Set<RoomPlatform>(), finished: false };
    entry.platforms.add(platform);
    if (typeof g.HighestAwardKind === 'string' && FINISHED_AWARDS.has(g.HighestAwardKind)) entry.finished = true;
    byTitle.set(title, entry);
  }
  return [...byTitle.entries()].map(([title, e]) => ({ title, platforms: [...e.platforms], ...(e.finished ? { isCompleted: true } : {}) }));
}

type Fetch = typeof fetch;

/** One page of the person's completion progress. `total` is how many games the profile has in all. */
export async function fetchProgressPage(auth: RaAuth, offset: number, count: number, fetchImpl: Fetch = fetch): Promise<{ total: number; games: RaGame[] }> {
  const query = new URLSearchParams({ z: auth.username, y: auth.apiKey, u: auth.username, c: String(count), o: String(offset) });
  let res: Response;
  try {
    res = await fetchImpl(`${API}/API_GetUserCompletionProgress.php?${query.toString()}`, {
      headers: { accept: 'application/json', 'user-agent': 'QueueUp (self-hosted game backlog; https://github.com/trentnbauer/QueueUp)' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new RetroAchievementsError('Could not reach RetroAchievements. Try again in a moment.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new RetroAchievementsError('RetroAchievements did not accept that username and key. Check them, and use the Web API key from your RetroAchievements settings.', true);
  }
  if (res.status === 429) throw new RetroAchievementsError('RetroAchievements is limiting requests right now. Try again later.');
  if (res.status >= 500) throw new RetroAchievementsError('RetroAchievements is having problems right now. Try again later.');
  const body = (await res.json().catch(() => null)) as { Total?: number; Results?: RaGame[]; message?: string } | null;
  if (res.status === 404 || !body || !Array.isArray(body.Results)) {
    // A wrong key can also come back as a 200 with a message instead of a list.
    if (typeof body?.message === 'string' && /key|auth|unauthori[sz]ed/i.test(body.message)) {
      throw new RetroAchievementsError('RetroAchievements did not accept that username and key. Check them, and use the Web API key from your RetroAchievements settings.', true);
    }
    throw new RetroAchievementsError('RetroAchievements has no profile for that username.', true);
  }
  return { total: Number(body.Total) || body.Results.length, games: body.Results };
}

/** Checks the username and key work and the profile has games, returning how many games it lists. */
export async function verifyAccount(auth: RaAuth, fetchImpl: Fetch = fetch): Promise<number> {
  const { total } = await fetchProgressPage(auth, 0, 1, fetchImpl);
  if (total === 0) throw new RetroAchievementsError('That RetroAchievements profile has no games yet. Play something with achievements switched on, then try again.');
  return total;
}

/** Every game on the profile, page by page. */
export async function fetchLibrary(
  auth: RaAuth,
  fetchImpl: Fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<LibraryImportEntry[]> {
  const all: RaGame[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { total, games } = await fetchProgressPage(auth, page * PAGE_SIZE, PAGE_SIZE, fetchImpl);
    all.push(...games);
    if (games.length === 0 || all.length >= total) break;
    await sleep(PAGE_DELAY_MS);
  }
  return gamesToEntries(all);
}
