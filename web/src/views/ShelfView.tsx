import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGames } from '../hooks/useGames';
import { GameInputBar } from '../components/GameInputBar';
import { GameGrid } from '../components/GameGrid';

export function ShelfView() {
  const { user } = useAuth();
  const { switchView } = useView();
  const { games, isLoading, invalidate, updateStatus, vote, remove } = useGames(null);

  useEffect(() => {
    switchView({ type: 'personal' });
  }, [switchView]);

  if (!user) return null;

  return (
    <div>
      <GameInputBar roomId={null} onAdded={invalidate} />
      <GameGrid
        games={games}
        currentUserId={user.id}
        isLoading={isLoading}
        onStatusChange={updateStatus}
        onVote={vote}
        onRemove={remove}
      />
    </div>
  );
}
