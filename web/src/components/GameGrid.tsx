import { useMemo, useRef, useState } from 'react';
import type { Game, GameStatus, VoteValue } from '@squadqueue/shared';
import { GameCard, type MoveDestination } from './GameCard';
import { sortByScore, playNextGames, recommendedNextId, statusBucket } from './gameGridLogic';
import styles from './GameGrid.module.css';

const ALL = '__all__';

/** Genre/platform are stored as comma-joined labels (e.g. "PC, Xbox"), so filter options and
 * matching both split on ", " rather than treating the whole string as one value. */
function splitLabel(value: string | null): string[] {
  return value ? value.split(',').map((v) => v.trim()).filter(Boolean) : [];
}

function distinctValues(games: Game[], pick: (g: Game) => string | null): string[] {
  const values = new Set<string>();
  for (const game of games) {
    for (const v of splitLabel(pick(game))) values.add(v);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

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
  /** Where a game in this grid could be relocated to (every game here shares the same current
   * location, so the same destination list applies to all of them). */
  moveDestinations?: MoveDestination[];
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
  onRefreshPrice: (gameId: string) => void;
  onMove?: (gameId: string, destRoomId: string | null) => void;
}

export function GameGrid({
  games,
  currentUserId,
  isLoading,
  isError,
  loadError,
  onRetry,
  memberCount,
  moveDestinations,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  onMove,
}: GameGridProps) {
  const [platformFilter, setPlatformFilter] = useState(ALL);
  const [genreFilter, setGenreFilter] = useState(ALL);

  const platformOptions = useMemo(() => distinctValues(games, (g) => g.platform), [games]);
  const genreOptions = useMemo(() => distinctValues(games, (g) => g.genre), [games]);

  const sorted = useStableOrder(games);
  const { playNext, recommendedId, prioritized } = useMemo(() => {
    const candidates = playNextGames(games);
    const playNextSet = new Set(candidates.map((g) => g.id));
    return {
      playNext: playNextSet,
      recommendedId: recommendedNextId(games, candidates),
      prioritized: [...sorted].sort(
        (a, b) => statusBucket(a, playNextSet) - statusBucket(b, playNextSet),
      ),
    };
  }, [games, sorted]);

  const filtered = useMemo(
    () =>
      prioritized.filter(
        (g) =>
          (platformFilter === ALL || splitLabel(g.platform).includes(platformFilter)) &&
          (genreFilter === ALL || splitLabel(g.genre).includes(genreFilter)),
      ),
    [prioritized, platformFilter, genreFilter],
  );

  const hasActiveFilters = platformFilter !== ALL || genreFilter !== ALL;
  const showFilterBar = !isLoading && !isError && (platformOptions.length > 1 || genreOptions.length > 1);

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

  if (prioritized.length === 0) {
    return <div className={styles.empty}>Nothing here yet.</div>;
  }

  return (
    <>
      {showFilterBar && (
        <div className={styles.filterBar}>
          {platformOptions.length > 1 && (
            <select
              className={styles.filterSelect}
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              aria-label="Filter by platform"
            >
              <option value={ALL}>All platforms</option>
              {platformOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          {genreOptions.length > 1 && (
            <select
              className={styles.filterSelect}
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              aria-label="Filter by genre"
            >
              <option value={ALL}>All genres</option>
              {genreOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className={styles.empty}>{hasActiveFilters ? 'No games match these filters.' : 'Nothing here yet.'}</div>
      ) : (
        <div className={styles.cards}>
          {filtered.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              currentUserId={currentUserId}
              memberCount={memberCount}
              isPlayNext={playNext.has(game.id)}
              isRecommended={game.id === recommendedId}
              moveDestinations={moveDestinations}
              onStatusChange={(next) => onStatusChange(game.id, next)}
              onVote={(value) => onVote(game.id, value)}
              onRemove={() => onRemove(game.id)}
              onRefreshPrice={() => onRefreshPrice(game.id)}
              onMove={onMove ? (destRoomId) => onMove(game.id, destRoomId) : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}
