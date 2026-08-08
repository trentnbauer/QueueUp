import { useEffect, useMemo, useState } from 'react';
import type { GameStatus } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useGameFilter } from '../context/GameFilterContext';
import { useConfirm } from '../context/ConfirmContext';
import { useGames } from '../hooks/useGames';
import { useGameSearch } from '../hooks/useGameSearch';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { GameGrid } from '../components/GameGrid';
import { PlayingStrip } from '../components/PlayingStrip';
import { ComingSoonStrip } from '../components/ComingSoonStrip';
import { BeatenStrip } from '../components/BeatenStrip';
import { DroppedStrip } from '../components/DroppedStrip';
import { filterGames, ALL_FILTER_VALUE } from '../components/gameGridLogic';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import { TruncatedListBanner } from '../components/TruncatedListBanner';
import { BulkActionBar } from '../components/BulkActionBar';
import { PlaytimeReviewModal } from '../components/PlaytimeReviewModal';
import styles from './ShelfView.module.css';

export function ShelfView() {
  const { user } = useAuth();
  const { switchView } = useView();
  const confirm = useConfirm();
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
    setManualPrice,
    applyTag,
    removeTag,
    bulkUpdateStatus,
    isBulkUpdatingStatus,
    bulkRemove,
    isBulkRemoving,
  } = useGames(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // GameGrid applies the platform/genre/status/search filter internally (GameFilterContext) - bulk
  // actions must respect the same set of games actually on screen, or "Select all" while filtered
  // would silently reach into hidden games the user never saw (previously a real bug: selected/
  // updated the whole shelf regardless of the active filter). Playing/Done/Dropped/Won't Play are
  // excluded the same way GameGrid itself excludes them below (only while the status pill is "All" -
  // explicitly filtering to one of those is a deliberate ask to see/select it) now that they have
  // their own strips instead of showing a second time in the main grid.
  const gameFilter = useGameFilter();
  const visibleGames = useMemo(() => {
    const filtered = filterGames(games, gameFilter);
    if (gameFilter.statusFilter !== ALL_FILTER_VALUE) return filtered;
    return filtered.filter(
      (g) => g.status !== 'playing' && g.status !== 'play_next' && g.status !== 'done' && g.status !== 'dropped' && g.status !== 'wont_play',
    );
  }, [games, gameFilter]);

  // A title search looks across the whole shelf regardless of status or the 500-game recency cap
  // (see useGameSearch) - while one's active, it replaces the normal Playing/Coming Soon/main
  // grid/Beaten/Dropped layout with one flat list of matches instead of only ever searching
  // whatever each of those sections already happened to have loaded.
  const debouncedQuery = useDebouncedValue(gameFilter.searchQuery, 300);
  const search = useGameSearch(null, debouncedQuery);

  useEffect(() => {
    switchView({ type: 'personal' });
  }, [switchView]);

  // Bulk-select tracks selection against the non-search `visibleGames` above - once a search
  // starts, the grid switches to server search results instead, so bulk mode is exited rather than
  // left silently operating on the wrong list.
  useEffect(() => {
    if (search.isSearching && bulkMode) exitBulkMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.isSearching]);

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

  async function handleBulkRemove() {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ok = await confirm({
      title: `Remove ${count} game${count === 1 ? '' : 's'}?`,
      message: "This removes them from your Personal Shelf for good - it can't be undone.",
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await bulkRemove(Array.from(selectedIds));
      setSelectedIds(new Set());
    } catch {
      // Same as handleBulkSetStatus above - onError already surfaces the banner, and the selection
      // is left intact so the user can retry.
    }
  }

  if (!user) return null;

  return (
    <div>
      <PlaytimeReviewModal games={games} onStatusChange={updateStatus} />
      {bulkMode ? (
        <BulkActionBar
          selectedCount={selectedIds.size}
          allVisibleSelected={visibleGames.length > 0 && visibleGames.every((g) => selectedIds.has(g.id))}
          busy={isBulkUpdatingStatus || isBulkRemoving}
          onSelectAll={() =>
            setSelectedIds((prev) => new Set([...prev, ...visibleGames.map((g) => g.id)]))
          }
          onClear={() => setSelectedIds(new Set())}
          onSetStatus={handleBulkSetStatus}
          onRemove={handleBulkRemove}
          onCancel={exitBulkMode}
        />
      ) : (
        !search.isSearching &&
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
      {search.isSearching ? (
        <GameGrid
          games={search.games}
          currentUserId={user.id}
          isLoading={search.isLoading}
          isError={search.isError}
          loadError={search.loadError}
          onRetry={search.refetch}
          onStatusChange={updateStatus}
          onVote={vote}
          onRemove={remove}
          onRefreshPrice={refreshPrice}
          isRefreshingPrice={isRefreshingPrice}
          onSetSteamMatch={setSteamMatch}
          onSetTargetPrice={setTargetPrice}
          onSetManualPrice={setManualPrice}
          onApplyTag={applyTag}
          onRemoveTag={removeTag}
        />
      ) : (
        <>
          <PlayingStrip
            games={games}
            currentUserId={user.id}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
            onApplyTag={applyTag}
            onRemoveTag={removeTag}
          />
          <ComingSoonStrip
            games={games}
            currentUserId={user.id}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
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
            // Playing/Play Next/Done/Replay/Dropped/Won't Play games get their own strips above/below
            // instead - same reasoning as RoomView's identical hiddenStatuses, so they don't also show
            // a second time in the main grid here. Replay-queued games (issue #334) join Done under
            // BeatenStrip below, since a replay is by definition already-beaten; Play Next joins
            // Playing in the Currently Playing strip above; Won't Play joins Dropped (issue #569).
            hiddenStatuses={['playing', 'play_next', 'done', 'replay', 'dropped', 'wont_play']}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
            onApplyTag={applyTag}
            onRemoveTag={removeTag}
            selectionMode={bulkMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
          <BeatenStrip
            games={games}
            currentUserId={user.id}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
            onApplyTag={applyTag}
            onRemoveTag={removeTag}
          />
          <DroppedStrip
            games={games}
            currentUserId={user.id}
            onStatusChange={updateStatus}
            onVote={vote}
            onRemove={remove}
            onRefreshPrice={refreshPrice}
            isRefreshingPrice={isRefreshingPrice}
            onSetSteamMatch={setSteamMatch}
            onSetTargetPrice={setTargetPrice}
            onSetManualPrice={setManualPrice}
            onApplyTag={applyTag}
            onRemoveTag={removeTag}
          />
        </>
      )}
    </div>
  );
}
