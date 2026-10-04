/** Install size for a Steam game (#800). IGDB has no install or download size, but a Steam store
 * page's PC system requirements nearly always say how much disk space the game needs ("Storage:
 * 60 GB available space", or "Hard Drive:" on older pages) - close enough to the download size to
 * filter by. Only PC requirements exist, so it's the PC install size. */

// Run on whitespace-collapsed text (see parseStorageMb), so every gap is at most one space and
// nothing here can backtrack its way into a slow match.
const SIZE = /(?:storage|hard ?(?:disk|drive)(?: ?space)?|disk ?space|hdd|free ?space)(?:[ :]|<\/strong>)*(?:at least )?(\d[\d.,]*) ?(tb|gb|mb)\b/i;

/** Megabytes of disk space from a Steam requirements HTML/text block, or null if it doesn't say. */
export function parseStorageMb(requirements: string | null | undefined): number | null {
  if (!requirements) return null;
  // Store pages are written by publishers: cap the length and collapse whitespace before matching.
  const text = requirements.slice(0, 20_000).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const m = SIZE.exec(text);
  if (!m) return null;
  // "1,500 MB" is fifteen hundred; "8,5 GB" is eight and a half.
  const raw = m[1];
  const n = Number(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  const mb = unit === 'tb' ? n * 1024 * 1024 : unit === 'gb' ? n * 1024 : n;
  // Anything over 2 TB is a typo on the store page, not a real game.
  return mb > 2 * 1024 * 1024 ? null : Math.round(mb);
}

interface AppDetails {
  [appId: string]: { success: boolean; data?: { pc_requirements?: { minimum?: string; recommended?: string } | [] } };
}

/** The PC install size Steam lists for `appId`, in MB. Null when Steam doesn't say; throws when
 * Steam couldn't be reached (so the caller tries again later rather than remembering "none"). */
export async function fetchSteamStorageMb(appId: number): Promise<number | null> {
  const url = new URL('https://store.steampowered.com/api/appdetails');
  url.searchParams.set('appids', String(appId));
  url.searchParams.set('filters', 'pc_requirements');
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Steam appdetails ${response.status}`);
  const body = (await response.json()) as AppDetails;
  const req = body[String(appId)]?.data?.pc_requirements;
  if (!req || Array.isArray(req)) return null;
  // Minimum and recommended normally agree on storage; take the larger if they don't.
  const sizes = [parseStorageMb(req.minimum), parseStorageMb(req.recommended)].filter((n): n is number => n !== null);
  return sizes.length ? Math.max(...sizes) : null;
}
