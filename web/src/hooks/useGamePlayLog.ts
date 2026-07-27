import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/games';

/** Fetches this game's play journal (issue #361) on demand, when the detail modal mounts - same
 * on-demand reasoning as useGameAchievements, though this is a plain DB read rather than a live
 * Steam API call. Invalidated by useGames' updateStatus mutation whenever the status change that
 * opens/closes an entry happens while this same modal is open. */
export function useGamePlayLog(gameId: string) {
  const query = useQuery({
    queryKey: ['games', gameId, 'play-log'],
    queryFn: () => gamesApi.playLog(gameId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { entries: query.data?.entries ?? [], isLoading: query.isLoading };
}
