import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/games';

/** Fetches this game's per-player Steam achievement progress on demand, when the detail modal
 * mounts - not baked into the shelf/room list load, since it's a live Steam API call per player.
 * The server itself resolves to an empty list for a game with no Steam release or no players with
 * a usable Steam account, so there's no client-side gating needed beyond "the modal is open" (see
 * GameCard.tsx, which only mounts GameDetailModal - and so this hook - while detailOpen is true).
 * Failures resolve to an empty list too rather than surfacing an error - achievement progress is a
 * nice-to-have, not something worth blocking or erroring the rest of the modal over. */
export function useGameAchievements(gameId: string) {
  const query = useQuery({
    queryKey: ['games', gameId, 'achievements'],
    queryFn: () => gamesApi.achievements(gameId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { players: query.data?.players ?? [], isLoading: query.isLoading };
}
