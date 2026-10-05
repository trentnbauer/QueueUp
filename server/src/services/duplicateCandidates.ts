/** Cheap, no-AI pre-filter for the duplicate scan (issue #824): from a whole shelf, picks the short
 * list of card pairs that might be the same game, so the model only judges those. */

export interface DuplicateCandidateGame {
  id: string;
  igdbId: number;
  title: string;
  igdbCollectionId: number | null;
}

/** Words publishers add to a re-release: dropped before comparing titles. */
const EDITION_WORDS =
  /\b(game of the year|goty|director'?s cut|definitive|deluxe|ultimate|complete|gold|legendary|anniversary|enhanced|premium|special|extended|standard|remastered|remaster|remake|hd|collection|edition|version|rerelease|re-release)\b/g;

/** A title reduced to what makes it that game: no trademark signs, bracketed text, edition words,
 * punctuation or a leading "the". "The Witcher 3: Wild Hunt - Complete Edition" and
 * "Witcher 3 Wild Hunt" share a core. */
export function titleCore(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(EDITION_WORDS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The same pair always gets the same key, whichever card is first. */
export function igdbPairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export const MAX_DUPLICATE_PAIRS = 40;

/** Pairs worth asking the AI about: identical title cores, or (for the same IGDB collection) one
 * core containing the other, which catches a game and its "Wild Hunt"-style subtitle. Pairs the
 * person already dismissed (by igdbId, see igdbPairKey) are left out, as are two cards with the
 * same igdbId (an exact duplicate is caught elsewhere). Capped so one scan stays cheap. */
export function findCandidatePairs<T extends DuplicateCandidateGame>(games: T[], dismissed: Set<string>, max = MAX_DUPLICATE_PAIRS): [T, T][] {
  const cores = games.map((g) => titleCore(g.title));
  const pairs: [T, T][] = [];
  for (let i = 0; i < games.length && pairs.length < max; i++) {
    for (let j = i + 1; j < games.length && pairs.length < max; j++) {
      const a = games[i];
      const b = games[j];
      if (a.igdbId === b.igdbId || dismissed.has(igdbPairKey(a.igdbId, b.igdbId))) continue;
      const ca = cores[i];
      const cb = cores[j];
      if (!ca || !cb) continue;
      const sameCollection = a.igdbCollectionId !== null && a.igdbCollectionId === b.igdbCollectionId;
      const contains = sameCollection && Math.min(ca.length, cb.length) >= 4 && (ca.includes(cb) || cb.includes(ca));
      if (ca === cb || contains) pairs.push([a, b]);
    }
  }
  return pairs;
}
