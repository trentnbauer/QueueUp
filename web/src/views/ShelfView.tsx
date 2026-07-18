import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGames } from '../hooks/useGames';
import { GameGrid } from '../components/GameGrid';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import { TruncatedListBanner } from '../components/TruncatedListBanner';
import { SteamImportCard } from '../components/SteamImportCard';

export function ShelfView() {
  const { user, steamLinked } = useAuth();
  const { switchView } = useView();
  const {
    games,
    truncated,
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
    isRefreshingPrice,
    setTargetPrice,
  } = useGames(null);

  useEffect(() => {
    switchView({ type: 'personal' });
  }, [switchView]);

  if (!user) return null;

  return (
    <div>
      <ActionErrorBanner message={actionError} onDismiss={clearActionError} />
      <TruncatedListBanner truncated={truncated} />
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
        isRefreshingPrice={isRefreshingPrice}
        onSetTargetPrice={setTargetPrice}
        showSpinWheel
        trailingCard={<SteamImportCard steamLinked={steamLinked} onImported={invalidate} />}
      />
    </div>
  );
}
