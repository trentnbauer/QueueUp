import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGames } from '../hooks/useGames';
import { roomsApi } from '../api/rooms';
import { GameGrid } from '../components/GameGrid';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import { TruncatedListBanner } from '../components/TruncatedListBanner';
import { SpinTheWheel } from '../components/SpinTheWheel';

// Post-1.0 release feature: Spin the Wheel is temporarily hidden until its UI
// gets a redesign. Component is kept intact so it can be re-enabled easily.
// See: https://github.com/trentnbauer/SquadQueue/issues/103
const SPIN_THE_WHEEL_ENABLED = false;

export function RoomView() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { switchView } = useView();
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
  } = useGames(roomId ?? null);

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
      <ActionErrorBanner message={actionError} onDismiss={clearActionError} />
      <TruncatedListBanner truncated={truncated} />
      {SPIN_THE_WHEEL_ENABLED && !isLoading && !isError && <SpinTheWheel games={games} />}
      <GameGrid
        games={games}
        currentUserId={user.id}
        isLoading={isLoading}
        isError={isError}
        loadError={loadError}
        onRetry={refetch}
        memberCount={memberCount}
        onStatusChange={updateStatus}
        onVote={vote}
        onRemove={remove}
        onRefreshPrice={refreshPrice}
        isRefreshingPrice={isRefreshingPrice}
      />
    </div>
  );
}
