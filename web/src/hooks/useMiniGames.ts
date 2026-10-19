import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { LobbyGameId, MiniGameRatingValue, MiniGameRatingsResponse, MiniGameScorePeriod, MiniGameScoreScope } from '@queueup/shared';
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

/** Lobbies open to you (public ones, your friends', your own). Polled, since they come and go. */
export function useOpenLobbies(everySeconds = 15) {
  const { user } = useAuth();
  return useQuery({ queryKey: [...MINIGAMES_QUERY_KEY, 'lobbies'], queryFn: miniGamesApi.lobbies, enabled: !!user, refetchInterval: everySeconds * 1000 });
}

/** One open lobby and who is in it, refreshed while its dialog is open. An error means it has closed. */
export function useLobbyInfo(id: string) {
  return useQuery({ queryKey: [...MINIGAMES_QUERY_KEY, 'lobby', id], queryFn: () => miniGamesApi.lobby(id), refetchInterval: 2000, retry: 2 });
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

/** Your own thumbs up or down for each game, so the thumbs can show which one you picked. */
export function useMiniGameRatings() {
  const { user } = useAuth();
  return useQuery({ queryKey: [...MINIGAMES_QUERY_KEY, 'ratings'], queryFn: miniGamesApi.ratings, enabled: !!user });
}

/** Rates a game right away (the thumb lights up before the server answers) and puts it back if the save fails. */
export function useRateMiniGame() {
  const queryClient = useQueryClient();
  return useCallback(
    (game: LobbyGameId, rating: MiniGameRatingValue) => {
      const key = [...MINIGAMES_QUERY_KEY, 'ratings'];
      const before = queryClient.getQueryData<MiniGameRatingsResponse>(key);
      queryClient.setQueryData<MiniGameRatingsResponse>(key, { ratings: { ...before?.ratings, [game]: rating } });
      void miniGamesApi.rate(game, rating).catch(() => queryClient.setQueryData(key, before));
    },
    [queryClient],
  );
}
