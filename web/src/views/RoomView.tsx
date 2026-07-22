import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGames } from '../hooks/useGames';
import { roomsApi } from '../api/rooms';
import { GameGrid } from '../components/GameGrid';
import { PlayingStrip } from '../components/PlayingStrip';
import { BeatenStrip } from '../components/BeatenStrip';
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
    setTargetPrice,
    setOwnership,
    applyTag,
    removeTag,
  } = useGames(roomId ?? null);

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
        onSetTargetPrice={setTargetPrice}
        onSetOwnership={setOwnership}
        onApplyTag={applyTag}
        onRemoveTag={removeTag}
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
        hiddenStatuses={['playing', 'done']}
        onStatusChange={updateStatus}
        onVote={vote}
        onRemove={remove}
        onRefreshPrice={refreshPrice}
        isRefreshingPrice={isRefreshingPrice}
        onSetTargetPrice={setTargetPrice}
        onSetOwnership={setOwnership}
        onApplyTag={applyTag}
        onRemoveTag={removeTag}
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
        onSetTargetPrice={setTargetPrice}
        onSetOwnership={setOwnership}
        onApplyTag={applyTag}
        onRemoveTag={removeTag}
      />
    </div>
  );
}
