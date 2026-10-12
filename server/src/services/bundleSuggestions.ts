import type { BundleSuggestion } from '@queueup/shared';
import { getBundleContents, normalizeGameTitleForComparison, searchGames } from './igdbClient.js';

/** Most title parts looked up on IGDB for one bundle, so a long odd title cannot fan out. */
const MAX_TITLE_PARTS = 8;

/** The separate game names in a bundle's title, when it lists them: "Portal + Half-Life 2" and
 * "Fallout 3 / New Vegas" split, "Ratchet & Clank" and "Command and Conquer" do not (those words are
 * part of real titles). A trailing "Bundle", "Collection", "Pack" or "Double Pack" is dropped first,
 * and so is a leading "<Name> - " style label before a colon is kept as is. Fewer than two parts means
 * the title does not list its games, and the result is empty. */
export function splitBundleTitle(title: string): string[] {
  const cleaned = title.replace(/\s*[-:(]?\s*\b(?:double|triple|dual|game)?\s*(?:bundle|collection|pack)\)?\s*$/i, '').trim();
  const parts = cleaned
    .split(/\s+\+\s+|\s+\/\s+|\s+\|\s+|\s*\/\/\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  return parts.length >= 2 ? parts.slice(0, MAX_TITLE_PARTS) : [];
}

/** True when an IGDB result plausibly is the game a title part names. */
function matchesPart(resultTitle: string, part: string): boolean {
  const a = normalizeGameTitleForComparison(resultTitle);
  const b = normalizeGameTitleForComparison(part);
  return a.length > 0 && b.length > 0 && (a === b || a.startsWith(b) || b.startsWith(a));
}

/** Guesses the games inside a bundle (issue #857), best evidence first: what IGDB itself records as in
 * the bundle, then the names in the bundle's title looked up one by one. The bundle itself is never
 * suggested. Best effort: IGDB hiccups give fewer suggestions, not an error. */
export async function suggestBundleGames(game: { igdbId: number; title: string }): Promise<BundleSuggestion[]> {
  const found = new Map<number, BundleSuggestion>();
  const add = (list: BundleSuggestion[]) => {
    for (const s of list) if (s.igdbId !== game.igdbId && !found.has(s.igdbId)) found.set(s.igdbId, s);
  };

  try {
    add((await getBundleContents(game.igdbId)).map((g) => ({ ...g, source: 'igdb' as const })));
  } catch {
    // Falls through to the title.
  }

  const parts = splitBundleTitle(game.title);
  const looked = await Promise.all(
    parts.map(async (part): Promise<BundleSuggestion | null> => {
      try {
        const page = await searchGames(part);
        const hit = page.results.find((r) => r.igdbId !== game.igdbId && matchesPart(r.title, part));
        return hit ? { ...hit, source: 'title' } : null;
      } catch {
        return null;
      }
    }),
  );
  add(looked.filter((s): s is BundleSuggestion => s !== null));

  return [...found.values()];
}
