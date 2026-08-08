import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, type Query } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { tagsApi } from '../api/tags';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import { useAnnounceUnlock } from '../context/AchievementUnlockContext';
import type { Game, GameStatus, ShelfSyncSuggestion, VoteValue } from '@queueup/shared';

const GAMES_QUERY_ROOT = ['games'] as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** True for this list's *own* query key (['games','shelf',region] / ['games','room',roomId,region])
 * and for useGameSearch's sibling variant of the same list (['games','shelf-search',region,query] /
 * ['games','room',roomId,'search',region,query]) - both cache a `{ games, truncated }` shape for the
 * same underlying list, just via a different endpoint call, so a card's status/vote/etc. needs to
 * land in whichever one the user is currently looking at, not just whichever one this hook instance
 * itself queried with. Matched by roomId position (index 2 for both room variants) rather than a
 * literal prefix match, since the search variant inserts an extra 'search' segment before region. */
export function isSameGamesList(query: Query, roomId: string | null): boolean {
  const key = query.queryKey;
  if (key[0] !== 'games') return false;
  return roomId === null ? key[1] === 'shelf' || key[1] === 'shelf-search' : key[1] === 'room' && key[2] === roomId;
}

/** Handles listing + status/vote/remove mutations for either the personal shelf (roomId null) or a room. */
export function useGames(roomId: string | null) {
  const { region } = useCurrencyRegion();
  const queryKey = roomId ? ['games', 'room', roomId, region] : ['games', 'shelf', region];
  const queryClient = useQueryClient();
  const announceUnlock = useAnnounceUnlock();
  const [actionError, setActionError] = useState<string | null>(null);
  // Populated only when marking a *room* game Beaten surfaces a shelfSync suggestion (see
  // ShelfSyncSuggestion) - the room game's own id rides along so the confirm action knows which
  // game to sync from, without the caller having to track it separately.
  const [shelfSyncPrompt, setShelfSyncPrompt] = useState<{ roomGameId: string; suggestion: ShelfSyncSuggestion } | null>(
    null,
  );

  const query = useQuery({
    queryKey,
    queryFn: () => (roomId ? gamesApi.room(roomId, region) : gamesApi.shelf(region)),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  // The status/vote/refresh-price endpoints already return the fully-updated game DTO(s), and the
  // list is cached as { games: Game[]; truncated: boolean; totalCount: number } - patching those
  // rows into the cache directly avoids a full refetch (and re-render of every other card) for a
  // change that only ever affects a few. Patches every cached query for *this list*, not just this
  // hook instance's own queryKey (see isSameGamesList) - otherwise a status change made while
  // useGameSearch's results are on screen updates the non-search cache and leaves the visible
  // search results (and any detail modal opened from one) showing the pre-change state until the
  // search itself re-fires. `truncated`/`totalCount` are left untouched either way, since a status
  // change never adds or removes a game.
  function patchGames(updated: Game[]) {
    const byId = new Map(updated.map((g) => [g.id, g]));
    queryClient.setQueriesData<{ games: Game[]; truncated: boolean; totalCount: number }>(
      { predicate: (query) => isSameGamesList(query, roomId) },
      (old) => (old ? { ...old, games: old.games.map((g) => byId.get(g.id) ?? g) } : old),
    );
  }
  const patchGame = (updated: Game) => patchGames([updated]);

  function removeGameFromCache(gameId: string) {
    removeGamesFromCache([gameId]);
  }

  function removeGamesFromCache(gameIds: string[]) {
    const idSet = new Set(gameIds);
    queryClient.setQueriesData<{ games: Game[]; truncated: boolean; totalCount: number }>(
      { predicate: (query) => isSameGamesList(query, roomId) },
      (old) => (old ? { ...old, games: old.games.filter((g) => !idSet.has(g.id)), totalCount: old.totalCount - gameIds.length } : old),
    );
  }

  const updateStatus = useMutation({
    mutationFn: ({ gameId, status }: { gameId: string; status: GameStatus }) =>
      gamesApi.updateStatus(gameId, { status }),
    onSuccess: ({ game, shelfSync, unlockedBadges }) => {
      patchGame(game);
      if (shelfSync) setShelfSyncPrompt({ roomGameId: game.id, suggestion: shelfSync });
      // A status change can open/close a play journal entry (issue #361) server-side - this query
      // is separate from the games list cache patchGame updates, so it needs its own invalidation
      // or the detail modal (which stays mounted across a status click, never remounting to
      // refetch on its own) would keep showing whatever it fetched before the change.
      queryClient.invalidateQueries({ queryKey: ['games', game.id, 'play-log'] });
      announceUnlock(unlockedBadges);
    },
    onError: (err) => setActionError(errorMessage(err, 'Could not update that game\'s status.')),
  });

  const syncShelfBeaten = useMutation({
    mutationFn: (roomGameId: string) => gamesApi.syncShelfBeaten(roomGameId),
    // The updated/created row lives on the Personal Shelf's own query, not this (room) instance's
    // cache - invalidate every games query rather than trying to patch a cache this hook doesn't
    // hold, same reasoning as `move` below.
    onSuccess: ({ unlockedBadges }) => {
      queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
      announceUnlock(unlockedBadges);
    },
    onError: (err) => setActionError(errorMessage(err, 'Could not update your Personal Shelf.')),
  });

  const vote = useMutation({
    mutationFn: ({ gameId, value }: { gameId: string; value: VoteValue }) => gamesApi.vote(gameId, { value }),
    onSuccess: ({ game, unlockedBadges }) => {
      patchGame(game);
      announceUnlock(unlockedBadges);
    },
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
    onSuccess: ({ games: updated, unlockedBadges }) => {
      patchGames(updated);
      announceUnlock(unlockedBadges);
    },
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

  const setManualPrice = useMutation({
    mutationFn: ({ gameId, manualPrice }: { gameId: string; manualPrice: string | null }) =>
      gamesApi.setManualPrice(gameId, { manualPrice }),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not save that price.')),
  });

  const setOwnership = useMutation({
    mutationFn: ({ gameId, owned }: { gameId: string; owned: boolean }) => gamesApi.setOwnership(gameId, { owned }),
    onSuccess: ({ game, unlockedBadges }) => {
      patchGame(game);
      announceUnlock(unlockedBadges);
    },
    onError: (err) => setActionError(errorMessage(err, 'Could not update ownership.')),
  });

  const setPrerequisite = useMutation({
    mutationFn: ({ gameId, prerequisiteGameId }: { gameId: string; prerequisiteGameId: string | null }) =>
      gamesApi.setPrerequisite(gameId, { prerequisiteGameId }),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not save that.')),
  });

  const setSteamMatch = useMutation({
    mutationFn: ({ gameId, steamAppId }: { gameId: string; steamAppId: number | null }) =>
      gamesApi.setSteamMatch(gameId, { steamAppId }),
    onSuccess: ({ game }) => patchGame(game),
    onError: (err) => setActionError(errorMessage(err, 'Could not save that price match.')),
  });

  // Applies/removes a tag on one game (issue #247) - same patch-the-cache shape as
  // setTargetPrice/setOwnership above, since the endpoint returns the fully-updated game DTO
  // (including its now-current tags list) rather than requiring a separate tags fetch.
  const applyTag = useMutation({
    mutationFn: ({ gameId, name }: { gameId: string; name: string }) => tagsApi.applyToGame(gameId, { name }),
    onSuccess: ({ game, unlockedBadges }) => {
      patchGame(game);
      announceUnlock(unlockedBadges);
    },
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
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    loadError: query.error ? errorMessage(query.error, 'Could not load games.') : null,
    refetch: query.refetch,
    invalidate,
    actionError,
    clearActionError: () => setActionError(null),
    updateStatus: (gameId: string, status: GameStatus) => updateStatus.mutate({ gameId, status }),
    shelfSyncPrompt,
    confirmShelfSync: () => {
      if (!shelfSyncPrompt) return;
      syncShelfBeaten.mutate(shelfSyncPrompt.roomGameId);
      setShelfSyncPrompt(null);
    },
    dismissShelfSync: () => setShelfSyncPrompt(null),
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
    setManualPrice: (gameId: string, manualPrice: string | null) => setManualPrice.mutate({ gameId, manualPrice }),
    setOwnership: (gameId: string, owned: boolean) => setOwnership.mutate({ gameId, owned }),
    setPrerequisite: (gameId: string, prerequisiteGameId: string | null) =>
      setPrerequisite.mutate({ gameId, prerequisiteGameId }),
    setSteamMatch: (gameId: string, steamAppId: number | null) => setSteamMatch.mutate({ gameId, steamAppId }),
    isSettingSteamMatch: setSteamMatch.isPending,
    // Callers (TagPicker) only need to know when it's done/failed, not the updated game itself -
    // the cache is already patched via onSuccess above - so this resolves to void rather than
    // leaking the mutation's raw return value into every prop type down the component tree.
    applyTag: async (gameId: string, name: string) => {
      await applyTag.mutateAsync({ gameId, name });
    },
    removeTag: (gameId: string, tagId: string) => removeTag.mutate({ gameId, tagId }),
  };
}
