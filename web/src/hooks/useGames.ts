import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import type { Game, GameStatus, VoteValue } from '@queueup/shared';

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

  // The status/vote/refresh-price endpoints already return the single fully-updated game DTO, and
  // the list is cached as { games: Game[]; truncated: boolean } under this exact queryKey - patching
  // that one game into the cache directly avoids a full refetch (and re-render of every other card)
  // for a change that only ever affects one row. `truncated` is left untouched either way.
  function patchGame(updated: Game) {
    queryClient.setQueryData<{ games: Game[]; truncated: boolean }>(queryKey, (old) =>
      old ? { ...old, games: old.games.map((g) => (g.id === updated.id ? updated : g)) } : old,
    );
  }

  function removeGameFromCache(gameId: string) {
    queryClient.setQueryData<{ games: Game[]; truncated: boolean }>(queryKey, (old) =>
      old ? { ...old, games: old.games.filter((g) => g.id !== gameId) } : old,
    );
  }

  const updateStatus = useMutation({
    mutationFn: ({ gameId, status }: { gameId: string; status: GameStatus }) =>
      gamesApi.updateStatus(gameId, { status }),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not update that game\'s status.')),
  });

  const vote = useMutation({
    mutationFn: ({ gameId, value }: { gameId: string; value: VoteValue }) => gamesApi.vote(gameId, { value }),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not save your vote.')),
  });

  const remove = useMutation({
    mutationFn: (gameId: string) => gamesApi.remove(gameId),
    onSuccess: (_data, gameId) => removeGameFromCache(gameId),
    onError: (err) => setActionError(errorMessage(err, 'Could not remove that game.')),
  });

  const refreshPrice = useMutation({
    mutationFn: (gameId: string) => gamesApi.refreshPrice(gameId, region),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not refresh that game\'s price.')),
  });

  const setTargetPrice = useMutation({
    mutationFn: ({ gameId, targetPrice }: { gameId: string; targetPrice: string | null }) =>
      gamesApi.setTargetPrice(gameId, { targetPrice }),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not save that price alert.')),
  });

  const setOwnership = useMutation({
    mutationFn: ({ gameId, owned }: { gameId: string; owned: boolean }) => gamesApi.setOwnership(gameId, { owned }),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not update ownership.')),
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
    truncated: query.data?.truncated ?? false,
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
    // Only one refresh-price request is ever in flight at a time (single mutation), so "is this
    // game's refresh pending" is just "is the mutation pending for this game's id".
    isRefreshingPrice: (gameId: string) => refreshPrice.isPending && refreshPrice.variables === gameId,
    move: (gameId: string, destRoomId: string | null) => move.mutate({ gameId, destRoomId }),
    setTargetPrice: (gameId: string, targetPrice: string | null) => setTargetPrice.mutate({ gameId, targetPrice }),
    setOwnership: (gameId: string, owned: boolean) => setOwnership.mutate({ gameId, owned }),
  };
}
