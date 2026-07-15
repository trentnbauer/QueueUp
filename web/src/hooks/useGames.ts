import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import type { GameStatus, VoteValue } from '@squadqueue/shared';

const GAMES_QUERY_ROOT = ['games'] as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Handles listing + status/vote/remove mutations for either the personal shelf (roomId null) or a room. */
export function useGames(roomId: string | null) {
  const { region } = useCurrencyRegion();
  const queryKey = roomId ? ['games', 'room', roomId, region] : ['games', 'shelf', region];
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => (roomId ? gamesApi.room(roomId, region) : gamesApi.shelf(region)),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const updateStatus = useMutation({
    mutationFn: ({ gameId, status }: { gameId: string; status: GameStatus }) =>
      gamesApi.updateStatus(gameId, { status }),
    onSuccess: invalidate,
    onError: (err) => setActionError(errorMessage(err, 'Could not update that game\'s status.')),
  });

  const vote = useMutation({
    mutationFn: ({ gameId, value }: { gameId: string; value: VoteValue }) => gamesApi.vote(gameId, { value }),
    onSuccess: invalidate,
    onError: (err) => setActionError(errorMessage(err, 'Could not save your vote.')),
  });

  const remove = useMutation({
    mutationFn: (gameId: string) => gamesApi.remove(gameId),
    onSuccess: invalidate,
    onError: (err) => setActionError(errorMessage(err, 'Could not remove that game.')),
  });

  const refreshPrice = useMutation({
    mutationFn: (gameId: string) => gamesApi.refreshPrice(gameId),
    onSuccess: invalidate,
    onError: (err) => setActionError(errorMessage(err, 'Could not refresh that game\'s price.')),
  });

  const move = useMutation({
    mutationFn: ({ gameId, destRoomId }: { gameId: string; destRoomId: string | null }) =>
      gamesApi.move(gameId, { roomId: destRoomId }),
    // A move changes which list(s) a game belongs to, not just this one - invalidate every
    // games query (shelf and every room, any region) rather than just the current view's.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT }),
    onError: (err) => setActionError(errorMessage(err, 'Could not move that game.')),
  });

  return {
    games: query.data?.games ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    loadError: query.error ? errorMessage(query.error, 'Could not load games.') : null,
    refetch: query.refetch,
    invalidate,
    actionError,
    clearActionError: () => setActionError(null),
    updateStatus: (gameId: string, status: GameStatus) => updateStatus.mutate({ gameId, status }),
    vote: (gameId: string, value: VoteValue) => vote.mutate({ gameId, value }),
    remove: (gameId: string) => remove.mutate(gameId),
    refreshPrice: (gameId: string) => refreshPrice.mutate(gameId),
    move: (gameId: string, destRoomId: string | null) => move.mutate({ gameId, destRoomId }),
  };
}
