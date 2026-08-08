import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { GameCard } from './GameCard';
import { GameListRow } from './GameListRow';
import { ALL_FILTER_VALUE, filterGames, groupDlcAfterBaseGame, sortByScore, statusBucket } from './gameGridLogic';
import { useGameFilter } from '../context/GameFilterContext';
import { useViewMode } from '../context/ViewModeContext';
import styles from './GameGrid.module.css';

/** Sorts by score once when the page loads and then holds that order steady for the rest of the
 * session — nothing reshuffles while you're looking at it (a vote, a status change, someone else
 * adding a game) — the new sort only takes effect on the next page load/refresh. Newly-added games
 * that appear mid-session are appended at the end (sorted among themselves), not merged back into
 * score position, so they don't nudge anything already on screen. */
function useStableOrder(games: Game[]): Game[] {
  const orderRef = useRef<string[]>([]);
  const initializedRef = useRef(false);

  if (!initializedRef.current) {
    orderRef.current = sortByScore(games).map((g) => g.id);
    initializedRef.current = true;
  } else {
    const known = new Set(orderRef.current);
    const newArrivals = sortByScore(games.filter((g) => !known.has(g.id)));
    if (newArrivals.length > 0) {
      orderRef.current = [...orderRef.current, ...newArrivals.map((g) => g.id)];
    }
  }

  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  return useMemo(
    () => orderRef.current.map((id) => byId.get(id)).filter((g): g is Game => !!g),
    [byId],
  );
}

// A shelf/room can hold hundreds of games (MAX_GAMES_PER_LIST server-side) - rendering every card's
// worth of DOM (each with its own cover-art image, price fetch, etc.) up front made a big list
// noticeably slower to scroll than it needed to be. Rendered count grows as the user scrolls
// instead - render only a first screenful or two, then more as an IntersectionObserver sentinel
// near the bottom comes into view. Filtering/search/bulk-select all still operate on the *full*
// filtered list regardless of how much of it has been rendered - only the DOM output is capped,
// so none of those features silently only see a partial list.
const INITIAL_RENDER_COUNT = 30;
const RENDER_INCREMENT = 30;

interface GameGridProps {
  games: Game[];
  currentUserId: string;
  isLoading?: boolean;
  isError?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  /** Room member count, used to warn when a game's max co-op players is under this. Undefined on the Personal Shelf. */
  memberCount?: number;
  /** Full room member list, used to show who hasn't voted on a game yet. Undefined on the Personal
   * Shelf, same as memberCount - there's no group vote coverage to show for a solo list. */
  roomMembers?: User[];
  /** Extra tile rendered as the very last card in the grid, after every game and regardless of
   * filters (e.g. the Steam import tile on the Personal Shelf). */
  trailingCard?: ReactNode;
  /** Statuses to leave out of the main grid's cards because a caller already shows them elsewhere
   * (Communal Rooms' Currently Playing strip above, Beaten strip below) - showing them a third
   * time here would just be a duplicate. Still respected only when the status pill is set to "all":
   * explicitly filtering to one of these statuses is a deliberate ask to see it here, so it wins
   * over the hide. */
  hiddenStatuses?: GameStatus[];
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
  onRefreshPrice: (gameId: string) => void;
  /** Whether a given game's manual price refresh is currently in flight - drives the spinner. */
  isRefreshingPrice?: (gameId: string) => boolean;
  onSetSteamMatch: (gameId: string, steamAppId: number | null) => void;
  onSetTargetPrice: (gameId: string, targetPrice: string | null) => void;
  onSetManualPrice: (gameId: string, manualPrice: string | null) => void;
  /** Undefined on the Personal Shelf - ownership is a room-only concept (see GameCard). */
  onSetOwnership?: (gameId: string, owned: boolean) => void;
  /** Finds-or-creates a tag by name and applies it to a game (issue #247). */
  onApplyTag: (gameId: string, name: string) => Promise<void>;
  onRemoveTag: (gameId: string, tagId: string) => void;
  /** Undefined on the Personal Shelf - "play after" only makes sense against other games in the
   * same room (see GameDetailModal). */
  onSetPrerequisite?: (gameId: string, prerequisiteGameId: string | null) => void;
  /** Bulk-select mode (issue #205) - passed through to every GameCard when active. */
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (gameId: string) => void;
}

export function GameGrid({
  games,
  currentUserId,
  isLoading,
  isError,
  loadError,
  onRetry,
  memberCount,
  roomMembers,
  trailingCard,
  hiddenStatuses,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  isRefreshingPrice,
  onSetSteamMatch,
  onSetTargetPrice,
  onSetManualPrice,
  onSetOwnership,
  onApplyTag,
  onRemoveTag,
  onSetPrerequisite,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: GameGridProps) {
  // Filter selection lives in GameFilterContext, not here - the pill UI (and the search box) are
  // rendered by the Header (a sibling, not a parent, of this component) next to the Add Game button.
  const { platformFilter, genreFilter, statusFilter, tagFilter, searchQuery, neglectedFilter, staleWishlistFilter, coopReadyFilter } =
    useGameFilter();
  const { viewMode } = useViewMode();

  const sorted = useStableOrder(games);
  const prioritized = useMemo(
    () => [...sorted].sort((a, b) => statusBucket(a) - statusBucket(b)),
    [sorted],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      filterGames(prioritized, {
        platformFilter,
        genreFilter,
        statusFilter,
        tagFilter,
        searchQuery,
        neglectedFilter,
        staleWishlistFilter,
        coopReadyFilter,
      }),
    [prioritized, platformFilter, genreFilter, statusFilter, tagFilter, searchQuery, neglectedFilter, staleWishlistFilter, coopReadyFilter],
  );

  const hasActiveFilters =
    platformFilter !== ALL_FILTER_VALUE ||
    genreFilter !== ALL_FILTER_VALUE ||
    tagFilter !== ALL_FILTER_VALUE ||
    neglectedFilter ||
    staleWishlistFilter ||
    coopReadyFilter ||
    normalizedQuery !== '';

  // hiddenStatuses only applies when the status pill is untouched - picking a hidden status
  // explicitly (e.g. filtering to "Playing") is a deliberate ask to see it here, and wins.
  const visible = useMemo(() => {
    if (!hiddenStatuses || hiddenStatuses.length === 0 || statusFilter !== ALL_FILTER_VALUE) return filtered;
    return filtered.filter((g) => !hiddenStatuses.includes(g.status));
  }, [filtered, hiddenStatuses, statusFilter]);

  // Issue #338: applied last, after every other ordering/filtering pass above - a DLC's placement
  // right after its base game overrides wherever score/status order would otherwise put it, but
  // only ever reorders within whatever's already passed every filter (a DLC filtered out along
  // with its base game just isn't here to reorder).
  const grouped = useMemo(() => groupDlcAfterBaseGame(visible), [visible]);

  const [renderCount, setRenderCount] = useState(INITIAL_RENDER_COUNT);
  // Back to the initial count on a genuinely new view (a filter/search changed) - not on every
  // change to `visible` itself, which also fires for an in-place edit (a vote, a status change)
  // that shouldn't collapse how much the user has already scrolled through.
  useEffect(() => {
    setRenderCount(INITIAL_RENDER_COUNT);
  }, [platformFilter, genreFilter, statusFilter, tagFilter, normalizedQuery, neglectedFilter, staleWishlistFilter, coopReadyFilter]);

  const rendered = useMemo(() => grouped.slice(0, renderCount), [grouped, renderCount]);
  const hasMore = grouped.length > rendered.length;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    // rootMargin extends the trigger zone below the viewport, so the next batch starts rendering
    // a bit before the sentinel is actually scrolled into view rather than right at the edge.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setRenderCount((c) => c + RENDER_INCREMENT);
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  const containerClass = viewMode === 'list' ? styles.list : styles.cards;

  if (isLoading) {
    return (
      <div className={containerClass}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={viewMode === 'list' ? styles.skeletonRow : styles.skeletonCard} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.error}>
        <p>{loadError ?? 'Could not load games.'}</p>
        {onRetry && (
          <button type="button" className={styles.retryButton} onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }

  // trailingCard is a fixed-aspect-ratio grid tile sized by its grid column - in the list view's
  // flex column (issue #344) it'd otherwise stretch to the row's full width, and aspect-ratio: 2/3
  // turns that into a giant box. Cap it back down to tile size there.
  const listTile = (node: ReactNode) => (viewMode === 'list' ? <div className={styles.listTile}>{node}</div> : node);
  const wrappedTrailingCard = trailingCard && listTile(trailingCard);

  if (prioritized.length === 0 || visible.length === 0) {
    const message = prioritized.length === 0
      ? 'Nothing here yet.'
      : hasActiveFilters
        ? 'No games match these filters.'
        : 'Nothing here yet.';

    if (!trailingCard) return <div className={styles.empty}>{message}</div>;

    return (
      <div className={containerClass}>
        <div className={`${styles.empty} ${styles.emptyInGrid}`}>{message}</div>
        {wrappedTrailingCard}
      </div>
    );
  }

  const GameFace = viewMode === 'list' ? GameListRow : GameCard;

  return (
    <div className={containerClass}>
      {rendered.map((game) => (
        <Fragment key={game.id}>
          <GameFace
            game={game}
            currentUserId={currentUserId}
            memberCount={memberCount}
            roomMembers={roomMembers}
            onStatusChange={(next) => onStatusChange(game.id, next)}
            onVote={(value) => onVote(game.id, value)}
            onRemove={() => onRemove(game.id)}
            onRefreshPrice={() => onRefreshPrice(game.id)}
            isRefreshingPrice={isRefreshingPrice ? isRefreshingPrice(game.id) : false}
            onSetSteamMatch={(steamAppId) => onSetSteamMatch(game.id, steamAppId)}
            onSetTargetPrice={(targetPrice) => onSetTargetPrice(game.id, targetPrice)}
            onSetManualPrice={(manualPrice) => onSetManualPrice(game.id, manualPrice)}
            onSetOwnership={onSetOwnership ? (owned) => onSetOwnership(game.id, owned) : undefined}
            onApplyTag={(name) => onApplyTag(game.id, name)}
            onRemoveTag={(tagId) => onRemoveTag(game.id, tagId)}
            roomGames={games}
            onSetPrerequisite={onSetPrerequisite ? (prerequisiteGameId) => onSetPrerequisite(game.id, prerequisiteGameId) : undefined}
            selectable={selectionMode}
            selected={selectedIds?.has(game.id) ?? false}
            onToggleSelect={onToggleSelect ? () => onToggleSelect(game.id) : undefined}
          />
        </Fragment>
      ))}
      {/* Invisible - just an IntersectionObserver target (see the effect above) marking where the
          next batch of games should start rendering as the user scrolls near it. Omitted once
          everything's already rendered. */}
      {hasMore && <div ref={sentinelRef} className={styles.loadMoreSentinel} aria-hidden="true" />}
      {wrappedTrailingCard}
    </div>
  );
}
