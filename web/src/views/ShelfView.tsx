import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGames } from '../hooks/useGames';
import { GameInputBar } from '../components/GameInputBar';
import { GameGrid } from '../components/GameGrid';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import { ExportButton } from '../components/ExportButton';
import { SteamImportButton } from '../components/SteamImportButton';
import { ShelfSettingsModal } from '../components/ShelfSettingsModal';
import styles from './ShelfView.module.css';

export function ShelfView() {
  const { user, steamLinked } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
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
    isRefreshingPrice,
  } = useGames(null);

  useEffect(() => {
    switchView({ type: 'personal' });
  }, [switchView]);

  if (!user) return null;

  return (
    <div>
      <GameInputBar roomId={null} onAdded={invalidate} />
      <div className={styles.row}>
        <button type="button" className={styles.settingsButton} onClick={() => setShowSettings(true)}>
          Systems Owned ▾
        </button>
      </div>
      {showSettings && <ShelfSettingsModal onClose={() => setShowSettings(false)} />}
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
        isRefreshingPrice={isRefreshingPrice}
      />
    </div>
  );
}
