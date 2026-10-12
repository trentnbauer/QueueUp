import type { LibraryImportEntry, RoomPlatform } from '@queueup/shared';

/** itch.io's official API (https://itch.io/docs/api/serverside): the games a person owns or has
 * claimed, read with a personal API key they make themselves at itch.io/user/settings/api-keys. The
 * key is sent once, as a Bearer header, and is never stored by QueueUp. */

const BASE = 'https://itch.io/api/1/x/my-owned-keys';
const MAX_PAGES = 200;

export class ItchError extends Error {
  constructor(
    message: string,
    /** True when the key was refused, so the person can fix it. */
    readonly badKey = false,
  ) {
    super(message);
  }
}

interface OwnedKey {
  game?: { title?: string; classification?: string; traits?: string[] } | null;
}

const PLATFORM_TRAITS: [string, RoomPlatform][] = [
  ['p_windows', 'pc'],
  ['p_linux', 'pc'],
  ['p_osx', 'pc'],
  ['p_android', 'android'],
];

/** itch.io lists tools, soundtracks, comics and so on next to games; only games are kept. The
 * platforms come from the game's own download traits, PC when it gives none (web games). */
export function ownedKeysToEntries(keys: OwnedKey[]): LibraryImportEntry[] {
  const byTitle = new Map<string, LibraryImportEntry>();
  for (const k of keys) {
    const game = k.game;
    const title = game?.title?.trim();
    if (!title || (game?.classification && game.classification !== 'game')) continue;
    const traits = game?.traits ?? [];
    const platforms = [...new Set(PLATFORM_TRAITS.filter(([trait]) => traits.includes(trait)).map(([, p]) => p))];
    let entry = byTitle.get(title.toLowerCase());
    if (!entry) {
      entry = { title, platforms: [] };
      byTitle.set(title.toLowerCase(), entry);
    }
    for (const p of platforms.length > 0 ? platforms : (['pc'] as RoomPlatform[])) {
      if (!entry.platforms.includes(p)) entry.platforms.push(p);
    }
  }
  return [...byTitle.values()];
}

export async function fetchItchLibrary(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<LibraryImportEntry[]> {
  const keys: OwnedKey[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetchImpl(`${BASE}?page=${page}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'User-Agent': 'QueueUp' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ItchError('Could not reach itch.io. Try again in a moment.');
    }
    if (res.status === 401 || res.status === 403) throw new ItchError('itch.io did not accept that API key. Check you copied all of it.', true);
    if (res.status === 429) throw new ItchError('itch.io is limiting requests right now. Try again in a few minutes.');
    if (!res.ok) throw new ItchError('itch.io had a problem. Try again in a moment.');
    const body = (await res.json().catch(() => null)) as { owned_keys?: OwnedKey[]; errors?: string[] } | null;
    if (body?.errors?.length) throw new ItchError('itch.io did not accept that API key. Check you copied all of it.', true);
    const batch = body?.owned_keys ?? [];
    if (batch.length === 0) break;
    keys.push(...batch);
  }
  return ownedKeysToEntries(keys);
}
