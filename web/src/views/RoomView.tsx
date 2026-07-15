import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGames } from '../hooks/useGames';
import { roomsApi } from '../api/rooms';
import { GameInputBar } from '../components/GameInputBar';
import { GameGrid } from '../components/GameGrid';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import { SpinTheWheel } from '../components/SpinTheWheel';
import { ExportButton } from '../components/ExportButton';

export function RoomView() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { switchView, rooms } = useView();
  const {
    games,
    isLoading,
    isError,
    loadError,
    refetch,
    invalidate,
    actionError,
    clearActionError,
    updateStatus,
    vote,
    remove,
    refreshPrice,
    move,
  } = useGames(roomId ?? null);

  const moveDestinations = [
    { roomId: null, label: 'Personal Shelf' },
    ...rooms.filter((r) => r.id !== roomId).map((r) => ({ roomId: r.id, label: r.name })),
  ];

  const { data: membersData } = useQuery({
    queryKey: ['room-members', roomId],
    queryFn: () => roomsApi.members(roomId!),
    enabled: !!roomId,
  });
  const memberCount = membersData?.members.length;

  useEffect(() => {
    if (roomId) switchView({ type: 'room', roomId });
  }, [roomId, switchView]);

  if (!user || !roomId) return null;

  return (
    <div>
      <GameInputBar roomId={roomId} onAdded={invalidate} />
      <ActionErrorBanner message={actionError} onDismiss={clearActionError} />
      {!isLoading && !isError && <SpinTheWheel games={games} />}
      {!isLoading && !isError && <ExportButton games={games} baseName="squad-room" />}
      <GameGrid
        games={games}
        currentUserId={user.id}
        isLoading={isLoading}
        isError={isError}
        loadError={loadError}
        onRetry={refetch}
        memberCount={memberCount}
        moveDestinations={moveDestinations}
        onStatusChange={updateStatus}
        onVote={vote}
        onRemove={remove}
        onRefreshPrice={refreshPrice}
        onMove={move}
      />
    </div>
  );
}
