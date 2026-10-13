import { useQuery } from '@tanstack/react-query';
import type { DuplicateSuggestionGame, Game, GameSearchResult } from '@queueup/shared';
import { gamesApi } from '../api/games';
import type { MergeGame } from '../ui/MergeStage';

type Companies = Record<number, { developer: string | null; publisher: string | null }>;

/** Developer and publisher for these IGDB ids (cached), keyed by id. Empty until loaded, or if IGDB can't be reached. */
export function useMergeCompanies(igdbIds: (number | null | undefined)[]): Companies {
  const ids = [...new Set(igdbIds.filter((i): i is number => typeof i === 'number' && i > 0))].sort((a, b) => a - b);
  const { data } = useQuery({
    queryKey: ['merge-details', ids.join(',')],
    queryFn: () => gamesApi.mergeDetails(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 60_000,
  });
  return data?.details ?? {};
}

/** A game card as one side of a merge or remaster. */
export function toMergeGame(g: Game, companies: Companies): MergeGame {
  return {
    title: g.title,
    coverImageUrl: g.coverImageUrl,
    date: g.releaseDate ? g.releaseDate.slice(0, 10) : g.releaseYear ? String(g.releaseYear) : null,
    developer: companies[g.igdbId]?.developer ?? null,
    publisher: companies[g.igdbId]?.publisher ?? null,
    genre: g.genre,
    status: g.status,
    playtimeHours: g.currentPlaytimeMinutes ? Math.round(g.currentPlaytimeMinutes / 60) : null,
  };
}

/** An IGDB result (a re-match target): no status, and little besides title, cover and year. */
export function resultToMergeGame(r: GameSearchResult, companies: Companies): MergeGame {
  return {
    title: r.title,
    coverImageUrl: r.coverImageUrl,
    date: r.releaseYear ? String(r.releaseYear) : null,
    developer: companies[r.igdbId]?.developer ?? null,
    publisher: companies[r.igdbId]?.publisher ?? null,
    genre: null,
    status: null,
  };
}

/** A card in the duplicate finder's pair. */
export function suggestionToMergeGame(g: DuplicateSuggestionGame): MergeGame {
  return {
    title: g.title,
    coverImageUrl: g.coverImageUrl,
    date: g.releaseDate ?? (g.releaseYear ? String(g.releaseYear) : null),
    developer: g.developer,
    publisher: g.publisher,
    genre: g.genre,
    status: g.status,
  };
}
