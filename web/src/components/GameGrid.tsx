import { useMemo, useRef, useState } from 'react';
import type { Game, GameStatus, VoteValue } from '@squadqueue/shared';
import { GameCard } from './GameCard';
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

interface PillFilterProps {
  label: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Single-select filter rendered as a row of toggleable pills (matching the app's existing
 * pill-badge look) instead of a bare <select> - reads as part of the page rather than a form. */
function PillFilter({ label, allLabel, options, value, onChange }: PillFilterProps) {
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterLabel}>{label}</span>
      <div className={styles.filterPills}>
        <button
          type="button"
          className={`${styles.filterPill} ${value === ALL ? styles.filterPillActive : ''}`}
          onClick={() => onChange(ALL)}
        >
          {allLabel}
        </button>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.filterPill} ${value === option ? styles.filterPillActive : ''}`}
            onClick={() => onChange(value === option ? ALL : option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
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
  /** A Room already has one fixed platform, so every game in it matches - the platform filter is
   * only meaningful on the Personal Shelf, where games can span multiple systems. Defaults to true. */
  showPlatformFilter?: boolean;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
  onRefreshPrice: (gameId: string) => void;
  /** Whether a given game's manual price refresh is currently in flight - drives the spinner. */
  isRefreshingPrice?: (gameId: string) => boolean;
}

export function GameGrid({
  games,
  currentUserId,
  isLoading,
  isError,
  loadError,
  onRetry,
  memberCount,
  showPlatformFilter = true,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  isRefreshingPrice,
}: GameGridProps) {
  const [platformFilter, setPlatformFilter] = useState(ALL);
  const [genreFilter, setGenreFilter] = useState(ALL);

  const platformOptions = useMemo(
    () => (showPlatformFilter ? distinctValues(games, (g) => g.platform) : []),
    [games, showPlatformFilter],
  );
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
            <PillFilter
              label="Platform"
              allLabel="All platforms"
              options={platformOptions}
              value={platformFilter}
              onChange={setPlatformFilter}
            />
          )}
          {genreOptions.length > 1 && (
            <PillFilter
              label="Genre"
              allLabel="All genres"
              options={genreOptions}
              value={genreFilter}
              onChange={setGenreFilter}
            />
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
              onStatusChange={(next) => onStatusChange(game.id, next)}
              onVote={(value) => onVote(game.id, value)}
              onRemove={() => onRemove(game.id)}
              onRefreshPrice={() => onRefreshPrice(game.id)}
              isRefreshingPrice={isRefreshingPrice ? isRefreshingPrice(game.id) : false}
            />
          ))}
        </div>
      )}
    </>
  );
}
