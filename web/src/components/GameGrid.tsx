import { useMemo, useRef } from 'react';
import type { Game, GameStatus, VoteValue } from '@squadqueue/shared';
import { GameCard } from './GameCard';
import { sortByScore, playNextGames, recommendedNextId, statusBucket } from './gameGridLogic';
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
  /** Room member count, used to warn when a game's max co-op players is under this. Undefined on the Personal Shelf. */
  memberCount?: number;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
  onRefreshPrice: (gameId: string) => void;
}

export function GameGrid({
  games,
  currentUserId,
  isLoading,
  memberCount,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
}: GameGridProps) {
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

  if (isLoading) {
    return (
      <div className={styles.cards}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeletonCard} />
        ))}
      </div>
    );
  }

  if (prioritized.length === 0) {
    return <div className={styles.empty}>Nothing here yet.</div>;
  }

  return (
    <div className={styles.cards}>
      {prioritized.map((game) => (
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
        />
      ))}
    </div>
  );
}
