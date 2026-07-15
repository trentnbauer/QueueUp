import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGames } from '../hooks/useGames';
import { GameInputBar } from '../components/GameInputBar';
import { GameGrid } from '../components/GameGrid';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import { ExportButton } from '../components/ExportButton';
import { SteamImportButton } from '../components/SteamImportButton';

export function ShelfView() {
  const { user, steamLinked } = useAuth();
  const { switchView } = useView();
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
  } = useGames(null);

  useEffect(() => {
    switchView({ type: 'personal' });
  }, [switchView]);

  if (!user) return null;

  return (
    <div>
      <GameInputBar roomId={null} onAdded={invalidate} />
      <ActionErrorBanner message={actionError} onDismiss={clearActionError} />
      {steamLinked && <SteamImportButton onImported={invalidate} />}
      {!isLoading && !isError && <ExportButton games={games} baseName="my-shelf" />}
      <GameGrid
        games={games}
        currentUserId={user.id}
        isLoading={isLoading}
        isError={isError}
        loadError={loadError}
        onRetry={refetch}
        onStatusChange={updateStatus}
        onVote={vote}
        onRemove={remove}
        onRefreshPrice={refreshPrice}
      />
    </div>
  );
}
