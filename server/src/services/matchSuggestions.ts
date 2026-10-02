import type { GameSearchResult, PendingImportCandidate } from '@queueup/shared';

/** The most suggestions put ahead of IGDB's own candidates for one imported title. */
export const MAX_SUGGESTIONS = 3;

export interface PickCount {
  igdbId: number;
  /** How many other people picked this game for the title. */
  count: number;
}

/** What is known about a game picked by someone, from a game already in the database. */
export type KnownGame = Pick<GameSearchResult, 'igdbId' | 'title' | 'platform' | 'coverImageUrl' | 'releaseYear'>;

/** Puts what other people matched a title to at the front of its candidates, most-picked first (at
 * most MAX_SUGGESTIONS), tagged with how many people picked it. A candidate IGDB also returned is
 * moved up and tagged rather than listed twice; a pick we know nothing about (no IGDB candidate and
 * no game in the database) is skipped. */
export function orderCandidates(candidates: GameSearchResult[], picks: PickCount[], known: Map<number, KnownGame>): PendingImportCandidate[] {
  const suggested: PendingImportCandidate[] = [];
  for (const pick of [...picks].sort((a, b) => b.count - a.count).slice(0, MAX_SUGGESTIONS)) {
    const base = candidates.find((c) => c.igdbId === pick.igdbId) ?? known.get(pick.igdbId);
    if (base) suggested.push({ ...base, suggestedBy: pick.count });
  }
  const rest = candidates.filter((c) => !suggested.some((s) => s.igdbId === c.igdbId));
  return [...suggested, ...rest];
}
