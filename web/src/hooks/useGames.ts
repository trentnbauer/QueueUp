import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { tagsApi } from '../api/tags';
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

  // The status/vote/refresh-price endpoints already return the fully-updated game DTO(s), and the
  // list is cached as { games: Game[]; truncated: boolean } under this exact queryKey - patching
  // those rows into the cache directly avoids a full refetch (and re-render of every other card)
  // for a change that only ever affects a few. `truncated` is left untouched either way.
  function patchGames(updated: Game[]) {
    const byId = new Map(updated.map((g) => [g.id, g]));
    queryClient.setQueryData<{ games: Game[]; truncated: boolean }>(queryKey, (old) =>
      old ? { ...old, games: old.games.map((g) => byId.get(g.id) ?? g) } : old,
    );
  }
  const patchGame = (updated: Game) => patchGames([updated]);

  function removeGameFromCache(gameId: string) {
    removeGamesFromCache([gameId]);
  }

  function removeGamesFromCache(gameIds: string[]) {
    const idSet = new Set(gameIds);
    queryClient.setQueryData<{ games: Game[]; truncated: boolean }>(queryKey, (old) =>
      old ? { ...old, games: old.games.filter((g) => !idSet.has(g.id)) } : old,
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

  const bulkUpdateStatus = useMutation({
    mutationFn: ({ gameIds, status }: { gameIds: string[]; status: GameStatus }) =>
      gamesApi.bulkUpdateStatus({ gameIds, status }, region),
    onSuccess: ({ games: updated }) => patchGames(updated),
    onError: (err) => setActionError(errorMessage(err, 'Could not update those games.')),
  });

  const bulkRemove = useMutation({
    mutationFn: (gameIds: string[]) => gamesApi.bulkRemove({ gameIds }),
    onSuccess: (_data, gameIds) => removeGamesFromCache(gameIds),
    onError: (err) => setActionError(errorMessage(err, 'Could not remove those games.')),
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

  // Applies/removes a tag on one game (issue #247) - same patch-the-cache shape as
  // setTargetPrice/setOwnership above, since the endpoint returns the fully-updated game DTO
  // (including its now-current tags list) rather than requiring a separate tags fetch.
  const applyTag = useMutation({
    mutationFn: ({ gameId, name }: { gameId: string; name: string }) => tagsApi.applyToGame(gameId, { name }),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not add that tag.')),
  });

  const removeTag = useMutation({
    mutationFn: ({ gameId, tagId }: { gameId: string; tagId: string }) => tagsApi.removeFromGame(gameId, tagId),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not remove that tag.')),
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
    bulkUpdateStatus: (gameIds: string[], status: GameStatus) => bulkUpdateStatus.mutateAsync({ gameIds, status }),
    isBulkUpdatingStatus: bulkUpdateStatus.isPending,
    bulkRemove: (gameIds: string[]) => bulkRemove.mutateAsync(gameIds),
    isBulkRemoving: bulkRemove.isPending,
    // Only one refresh-price request is ever in flight at a time (single mutation), so "is this
    // game's refresh pending" is just "is the mutation pending for this game's id".
    isRefreshingPrice: (gameId: string) => refreshPrice.isPending && refreshPrice.variables === gameId,
    move: (gameId: string, destRoomId: string | null) => move.mutate({ gameId, destRoomId }),
    setTargetPrice: (gameId: string, targetPrice: string | null) => setTargetPrice.mutate({ gameId, targetPrice }),
    setOwnership: (gameId: string, owned: boolean) => setOwnership.mutate({ gameId, owned }),
    // Callers (TagPicker) only need to know when it's done/failed, not the updated game itself -
    // the cache is already patched via onSuccess above - so this resolves to void rather than
    // leaking the mutation's raw return value into every prop type down the component tree.
    applyTag: async (gameId: string, name: string) => {
      await applyTag.mutateAsync({ gameId, name });
    },
    removeTag: (gameId: string, tagId: string) => removeTag.mutate({ gameId, tagId }),
  };
}
