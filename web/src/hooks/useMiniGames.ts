import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { LobbyGameId, MiniGameScorePeriod, MiniGameScoreScope } from '@queueup/shared';
import { miniGamesApi } from '../api/miniGames';
import { useAuth } from '../context/AuthContext';

export const MINIGAMES_QUERY_KEY = ['minigames'] as const;

export function useMiniGameScores(game: LobbyGameId, scope: MiniGameScoreScope, period: MiniGameScorePeriod) {
  const { user } = useAuth();
  return useQuery({ queryKey: [...MINIGAMES_QUERY_KEY, 'scores', game, scope, period], queryFn: () => miniGamesApi.scores(game, scope, period), enabled: !!user });
}

export function useMiniGameMe(game: LobbyGameId) {
  const { user } = useAuth();
  return useQuery({ queryKey: [...MINIGAMES_QUERY_KEY, 'me', game], queryFn: () => miniGamesApi.me(game), enabled: !!user });
}

/** Your best in every game, for the game cards. */
export function useMiniGameBests() {
  const { user } = useAuth();
  return useQuery({ queryKey: [...MINIGAMES_QUERY_KEY, 'bests'], queryFn: miniGamesApi.bests, enabled: !!user });
}

/** Saves a finished solo run and refreshes everything that shows scores. A failure is ignored: a score
 * that did not save must never get in the way of the next run. */
export function useSubmitSoloScore() {
  const queryClient = useQueryClient();
  return useCallback(
    (game: LobbyGameId, score: number) => {
      void miniGamesApi
        .submit(game, score)
        .then(() => queryClient.invalidateQueries({ queryKey: MINIGAMES_QUERY_KEY }))
        .catch(() => {});
    },
    [queryClient],
  );
}
