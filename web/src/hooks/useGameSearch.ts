import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';

/** Server-side title search across a shelf/room's *entire* library - unlike the primary games
 * list (useGames), this isn't capped to the 500 most-recently-added games and isn't restricted to
 * whatever statuses the main grid shows (Playing/Beaten/Dropped included), since the point of a
 * search is finding a specific game you already know you have, not browsing a curated backlog.
 * `query` should already be debounced by the caller - this fires a request on every value it sees. */
export function useGameSearch(roomId: string | null, query: string) {
  const { region } = useCurrencyRegion();
  const trimmed = query.trim();
  const enabled = trimmed.length > 0;

  const result = useQuery({
    queryKey: roomId ? ['games', 'room', roomId, 'search', region, trimmed] : ['games', 'shelf-search', region, trimmed],
    queryFn: () => (roomId ? gamesApi.room(roomId, region, trimmed) : gamesApi.shelf(region, trimmed)),
    enabled,
  });

  return {
    isSearching: enabled,
    games: enabled ? result.data?.games ?? [] : [],
    isLoading: enabled && result.isLoading,
    isError: enabled && result.isError,
    loadError: result.error instanceof Error && result.error.message ? result.error.message : null,
    refetch: result.refetch,
  };
}
