import { Fragment, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { GameCard } from './GameCard';
import { SpinWheelCard } from './SpinWheelCard';
import { ALL_FILTER_VALUE, splitLabel, sortByScore, statusBucket } from './gameGridLogic';
import { useGameFilter } from '../context/GameFilterContext';
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
  /** Shows the Spin the Wheel tile as part of the grid - rooms only, not the Personal Shelf
   * (there's no group decision to help make there). */
  showSpinWheel?: boolean;
  /** Room Settings toggle - restricts Spin the Wheel to games every current member owns. */
  spinOnlyFullyOwned?: boolean;
  /** Extra tile rendered as the very last card in the grid, after every game and regardless of
   * filters (e.g. the Steam import tile on the Personal Shelf) - unlike the Spin the Wheel tile,
   * this doesn't get slotted into a specific status position. */
  trailingCard?: ReactNode;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
  onRefreshPrice: (gameId: string) => void;
  /** Whether a given game's manual price refresh is currently in flight - drives the spinner. */
  isRefreshingPrice?: (gameId: string) => boolean;
  onSetTargetPrice: (gameId: string, targetPrice: string | null) => void;
  /** Undefined on the Personal Shelf - ownership is a room-only concept (see GameCard). */
  onSetOwnership?: (gameId: string, owned: boolean) => void;
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
  showSpinWheel,
  spinOnlyFullyOwned,
  trailingCard,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  isRefreshingPrice,
  onSetTargetPrice,
  onSetOwnership,
}: GameGridProps) {
  // Filter selection lives in GameFilterContext, not here - the pill UI itself is rendered by the
  // Header (a sibling, not a parent, of this component) next to the Add Game button.
  const { platformFilter, genreFilter, statusFilter } = useGameFilter();

  const sorted = useStableOrder(games);
  const prioritized = useMemo(
    () => [...sorted].sort((a, b) => statusBucket(a) - statusBucket(b)),
    [sorted],
  );

  const filtered = useMemo(
    () =>
      prioritized.filter(
        (g) =>
          (platformFilter === ALL_FILTER_VALUE || splitLabel(g.platform).includes(platformFilter)) &&
          (genreFilter === ALL_FILTER_VALUE || splitLabel(g.genre).includes(genreFilter)) &&
          (statusFilter === ALL_FILTER_VALUE || g.status === statusFilter),
      ),
    [prioritized, platformFilter, genreFilter, statusFilter],
  );

  const hasActiveFilters = platformFilter !== ALL_FILTER_VALUE || genreFilter !== ALL_FILTER_VALUE;

  if (isLoading) {
    return (
      <div className={styles.cards}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeletonCard} />
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

  const spinCard = showSpinWheel && <SpinWheelCard games={games} spinOnlyFullyOwned={spinOnlyFullyOwned} />;

  if (prioritized.length === 0 || filtered.length === 0) {
    const message = prioritized.length === 0
      ? 'Nothing here yet.'
      : hasActiveFilters
        ? 'No games match these filters.'
        : 'Nothing here yet.';

    if (!spinCard && !trailingCard) return <div className={styles.empty}>{message}</div>;

    return (
      <div className={styles.cards}>
        {spinCard}
        <div className={`${styles.empty} ${styles.emptyInGrid}`}>{message}</div>
        {trailingCard}
      </div>
    );
  }

  // The spin tile sits between the Playing group and the rest (backlog, then Done) - filtered is
  // already sorted Playing-first by statusBucket, so the first non-Playing game marks exactly
  // where that boundary is. If every visible game is currently Playing, it falls in after all of
  // them instead.
  const spinCardInsertIndex = spinCard
    ? (() => {
        const index = filtered.findIndex((g) => g.status !== 'playing');
        return index === -1 ? filtered.length : index;
      })()
    : -1;

  return (
    <div className={styles.cards}>
      {filtered.map((game, index) => (
        <Fragment key={game.id}>
          {index === spinCardInsertIndex && spinCard}
          <GameCard
            game={game}
            currentUserId={currentUserId}
            memberCount={memberCount}
            roomMembers={roomMembers}
            onStatusChange={(next) => onStatusChange(game.id, next)}
            onVote={(value) => onVote(game.id, value)}
            onRemove={() => onRemove(game.id)}
            onRefreshPrice={() => onRefreshPrice(game.id)}
            isRefreshingPrice={isRefreshingPrice ? isRefreshingPrice(game.id) : false}
            onSetTargetPrice={(targetPrice) => onSetTargetPrice(game.id, targetPrice)}
            onSetOwnership={onSetOwnership ? (owned) => onSetOwnership(game.id, owned) : undefined}
          />
        </Fragment>
      ))}
      {spinCardInsertIndex === filtered.length && spinCard}
      {trailingCard}
    </div>
  );
}
