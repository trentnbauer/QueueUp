import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useConfirm } from '../context/ConfirmContext';
import { useGames } from '../hooks/useGames';
import { roomsApi } from '../api/rooms';
import { GameGrid } from '../components/GameGrid';
import { PlayingStrip } from '../components/PlayingStrip';
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
    setOwnership,
    applyTag,
    removeTag,
    setPrerequisite,
    shelfSyncPrompt,
    confirmShelfSync,
    dismissShelfSync,
  } = useGames(roomId ?? null);

  const confirm = useConfirm();

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
        onSetOwnership={setOwnership}
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
        showSpinWheel
        spinOnlyFullyOwned={activeRoom?.spinOnlyFullyOwned}
        spinWheelTheme={activeRoom?.spinWheelTheme}
        hiddenStatuses={['playing', 'done', 'dropped']}
        onStatusChange={updateStatus}
        onVote={vote}
        onRemove={remove}
        onRefreshPrice={refreshPrice}
        isRefreshingPrice={isRefreshingPrice}
        onSetSteamMatch={setSteamMatch}
        onSetTargetPrice={setTargetPrice}
        onSetOwnership={setOwnership}
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
        onSetOwnership={setOwnership}
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
        onSetOwnership={setOwnership}
        onApplyTag={applyTag}
        onRemoveTag={removeTag}
        onSetPrerequisite={setPrerequisite}
      />
    </div>
  );
}
