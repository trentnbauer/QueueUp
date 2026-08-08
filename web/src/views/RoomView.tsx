import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGameFilter } from '../context/GameFilterContext';
import { useConfirm } from '../context/ConfirmContext';
import { useGames } from '../hooks/useGames';
import { useGameSearch } from '../hooks/useGameSearch';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { roomsApi } from '../api/rooms';
import { GameGrid } from '../components/GameGrid';
import { PlayingStrip } from '../components/PlayingStrip';
import { ComingSoonStrip } from '../components/ComingSoonStrip';
import { BeatenStrip } from '../components/BeatenStrip';
import { DroppedStrip } from '../components/DroppedStrip';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import { TruncatedListBanner } from '../components/TruncatedListBanner';
import { RoomSizeWarningBanner } from '../components/RoomSizeWarningBanner';
import { useMarkRoomNotificationsRead } from '../hooks/useNotifications';

export function RoomView() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { switchView, activeRoom } = useView();
  // The ownership toggle means "I own this on this room's platform" - meaningless (and rejected
  // by the server) for a platform-less room (issue #473), since there's no single platform to key
  // the claim on. See the ownership route in routes/games.ts.
  const canToggleOwnership = Boolean(activeRoom?.platform);
  const {
    games,
    truncated,
    isLoading,
    isError,
    loadError,
    refetch,
    actionError,
    clearActionError,
    updateStatus,
    vote,
    remove,
    refreshPrice,
    isRefreshingPrice,
    setSteamMatch,
    setTargetPrice,
    setManualPrice,
    setOwnership,
    applyTag,
    removeTag,
    setPrerequisite,
    shelfSyncPrompt,
    confirmShelfSync,
    dismissShelfSync,
  } = useGames(roomId ?? null);

  const confirm = useConfirm();

  // Same reasoning as ShelfView: a title search looks across the whole room regardless of status
  // or the 500-game recency cap (see useGameSearch), replacing the normal strips/main-grid layout
  // with one flat list of matches while it's active.
  const { searchQuery } = useGameFilter();
  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const search = useGameSearch(roomId ?? null, debouncedQuery);

  // A room game was just marked Beaten and the same game either isn't on the Personal Shelf at
  // all, or is there but not yet marked Beaten (see ShelfSyncSuggestion) - offer to sync it there
  // too rather than relying on someone to remember to go update it separately. Never the reverse.
  useEffect(() => {
    if (!shelfSyncPrompt) return;
    const { suggestion } = shelfSyncPrompt;
    confirm({
      title: 'Mark it Beaten on your shelf too?',
      message:
        suggestion.shelfGameId === null
          ? `"${suggestion.title}" isn't on your Personal Shelf yet - add it there, already marked Beaten?`
          : `"${suggestion.title}" is on your Personal Shelf too - mark it Beaten there as well?`,
      confirmLabel: 'Yes, sync it',
      cancelLabel: 'No thanks',
    }).then((ok) => (ok ? confirmShelfSync() : dismissShelfSync()));
    // Only re-runs when a *new* suggestion arrives (a fresh object identity each time), not on
    // every render of confirm/confirmShelfSync/dismissShelfSync themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfSyncPrompt]);

  const { data: membersData } = useQuery({
    queryKey: ['room-members', roomId],
    queryFn: () => roomsApi.members(roomId!),
    enabled: !!roomId,
  });
  const memberCount = membersData?.members.length;
  const roomMembers = membersData?.members.map((m) => m.user);

  const markRoomNotificationsRead = useMarkRoomNotificationsRead(roomId ?? null);

  useEffect(() => {
    if (roomId) switchView({ type: 'room', roomId });
  }, [roomId, switchView]);

  useEffect(() => {
    markRoomNotificationsRead();
    // Only when the room being viewed changes, not on every re-render of the mark-read callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  if (!user || !roomId) return null;

  return (
    <div>
      <ActionErrorBanner message={actionError} onDismiss={clearActionError} />
      <TruncatedListBanner truncated={truncated} />
      <RoomSizeWarningBanner memberCount={memberCount} />
      {search.isSearching ? (
        <GameGrid
          games={search.games}
          currentUserId={user.id}
          isLoading={search.isLoading}
          isError={search.isError}
          loadError={search.loadError}
          onRetry={search.refetch}
          memberCount={memberCount}
          roomMembers={roomMembers}
          onStatusChange={updateStatus}
          onVote={vote}
          onRemove={remove}
          onRefreshPrice={refreshPrice}
          isRefreshingPrice={isRefreshingPrice}
          onSetSteamMatch={setSteamMatch}
          onSetTargetPrice={setTargetPrice}
          onSetManualPrice={setManualPrice}
          onSetOwnership={canToggleOwnership ? setOwnership : undefined}
          onApplyTag={applyTag}
          onRemoveTag={removeTag}
          onSetPrerequisite={setPrerequisite}
        />
      ) : (
        <>
          <PlayingStrip
            games={games}
            currentUserId={user.id}
            memberCount={memberCount}
            roomMembers={roomMembers}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
            onSetOwnership={canToggleOwnership ? setOwnership : undefined}
            onApplyTag={applyTag}
            onRemoveTag={removeTag}
            onSetPrerequisite={setPrerequisite}
          />
          <ComingSoonStrip
            games={games}
            currentUserId={user.id}
            memberCount={memberCount}
            roomMembers={roomMembers}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
            onSetOwnership={canToggleOwnership ? setOwnership : undefined}
            onApplyTag={applyTag}
            onRemoveTag={removeTag}
            onSetPrerequisite={setPrerequisite}
          />
          <GameGrid
            games={games}
            currentUserId={user.id}
            isLoading={isLoading}
            isError={isError}
            loadError={loadError}
            onRetry={refetch}
            memberCount={memberCount}
            roomMembers={roomMembers}
            // Replay-queued games (issue #334) join Done under BeatenStrip below, and Play Next joins
            // Playing in the Currently Playing strip above - same as ShelfView. Won't Play joins
            // Dropped (issue #569).
            hiddenStatuses={['playing', 'play_next', 'done', 'replay', 'dropped', 'wont_play']}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
            onSetOwnership={canToggleOwnership ? setOwnership : undefined}
            onApplyTag={applyTag}
            onRemoveTag={removeTag}
            onSetPrerequisite={setPrerequisite}
          />
          <BeatenStrip
            games={games}
            currentUserId={user.id}
            memberCount={memberCount}
            roomMembers={roomMembers}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
            onSetOwnership={canToggleOwnership ? setOwnership : undefined}
            onApplyTag={applyTag}
            onRemoveTag={removeTag}
            onSetPrerequisite={setPrerequisite}
          />
          <DroppedStrip
            games={games}
            currentUserId={user.id}
            memberCount={memberCount}
            roomMembers={roomMembers}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
            onSetOwnership={canToggleOwnership ? setOwnership : undefined}
            onApplyTag={applyTag}
            onRemoveTag={removeTag}
            onSetPrerequisite={setPrerequisite}
          />
        </>
      )}
    </div>
  );
}
