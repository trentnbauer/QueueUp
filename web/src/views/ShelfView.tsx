import { useEffect, useMemo, useState } from 'react';
import type { GameStatus } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGameFilter } from '../context/GameFilterContext';
import { useGames } from '../hooks/useGames';
import { GameGrid } from '../components/GameGrid';
import { filterGames } from '../components/gameGridLogic';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import { TruncatedListBanner } from '../components/TruncatedListBanner';
import { SteamImportCard } from '../components/SteamImportCard';
import { BulkActionBar } from '../components/BulkActionBar';
import styles from './ShelfView.module.css';

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
    actionError,
    clearActionError,
    updateStatus,
    vote,
    remove,
    refreshPrice,
    isRefreshingPrice,
    setTargetPrice,
    bulkUpdateStatus,
    isBulkUpdatingStatus,
  } = useGames(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // GameGrid applies the platform/genre/status/search filter internally (GameFilterContext) - bulk
  // actions must respect the same set of games actually on screen, or "Select all" while filtered
  // would silently reach into hidden games the user never saw (previously a real bug: selected/
  // updated the whole shelf regardless of the active filter).
  const gameFilter = useGameFilter();
  const visibleGames = useMemo(() => filterGames(games, gameFilter), [games, gameFilter]);

  useEffect(() => {
    switchView({ type: 'personal' });
  }, [switchView]);

  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(gameId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  }

  async function handleBulkSetStatus(status: GameStatus) {
    if (selectedIds.size === 0) return;
    try {
      await bulkUpdateStatus(Array.from(selectedIds), status);
      setSelectedIds(new Set());
    } catch {
      // The mutation's onError already surfaces actionError via the banner - swallow here so a
      // failed bulk update doesn't also throw an unhandled rejection from this click handler, and
      // deliberately leave the selection intact (unlike the success path) so the user can retry.
    }
  }

  if (!user) return null;

  return (
    <div>
      {bulkMode ? (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={visibleGames.length}
          busy={isBulkUpdatingStatus}
          onSelectAll={() => setSelectedIds(new Set(visibleGames.map((g) => g.id)))}
          onClear={() => setSelectedIds(new Set())}
          onSetStatus={handleBulkSetStatus}
          onCancel={exitBulkMode}
        />
      ) : (
        games.length > 0 && (
          <div className={styles.toolbar}>
            <button type="button" className={styles.selectButton} onClick={() => setBulkMode(true)}>
              Select multiple
            </button>
          </div>
        )
      )}
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
        showSpinWheel={!bulkMode}
        trailingCard={!bulkMode && <SteamImportCard steamLinked={steamLinked} />}
        selectionMode={bulkMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />
    </div>
  );
}
