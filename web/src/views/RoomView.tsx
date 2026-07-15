import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGames } from '../hooks/useGames';
import { roomsApi } from '../api/rooms';
import { GameInputBar } from '../components/GameInputBar';
import { GameGrid } from '../components/GameGrid';

export function RoomView() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { switchView } = useView();
  const { games, isLoading, invalidate, updateStatus, vote, remove } = useGames(roomId ?? null);

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
      <GameGrid
        games={games}
        currentUserId={user.id}
        isLoading={isLoading}
        memberCount={memberCount}
        onStatusChange={updateStatus}
        onVote={vote}
        onRemove={remove}
      />
    </div>
  );
}
