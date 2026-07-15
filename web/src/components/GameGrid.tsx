import { useRef } from 'react';
import type { Game, GameStatus, VoteValue } from '@squadqueue/shared';
import { GameCard } from './GameCard';
import styles from './GameGrid.module.css';

function sortByScore(games: Game[]): Game[] {
  // Game.updatedAt only reflects status changes, not votes (votes have their own row/timestamp),
  // so ties break on createdAt (newest-added first) rather than a misleading "recently voted" signal.
  return [...games].sort((a, b) => {
    if (b.voteScore !== a.voteScore) return b.voteScore - a.voteScore;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
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

  const byId = new Map(games.map((g) => [g.id, g]));
  return orderRef.current.map((id) => byId.get(id)).filter((g): g is Game => !!g);
}

/** Top-3 backlog games by current score (recomputed live — a badge appearing/disappearing on an
 * already-positioned card is much less disruptive than the full reshuffle useStableOrder avoids,
 * and freezing "what to play next" to page-load time would make it stale as votes come in). Games
 * with no votes yet don't qualify — an unvoted game badged "play next" would be misleading. */
function playNextIds(games: Game[]): Set<string> {
  const eligible = sortByScore(games.filter((g) => g.status === 'backlog' && g.voteScore > 0));
  return new Set(eligible.slice(0, 3).map((g) => g.id));
}

interface GameGridProps {
  games: Game[];
  currentUserId: string;
  /** Room member count, used to warn when a game's max co-op players is under this. Undefined on the Personal Shelf. */
  memberCount?: number;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
}

export function GameGrid({ games, currentUserId, memberCount, onStatusChange, onVote, onRemove }: GameGridProps) {
  const sorted = useStableOrder(games);
  const playNext = playNextIds(games);

  if (sorted.length === 0) {
    return <div className={styles.empty}>Nothing here yet.</div>;
  }

  return (
    <div className={styles.cards}>
      {sorted.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          currentUserId={currentUserId}
          memberCount={memberCount}
          isPlayNext={playNext.has(game.id)}
          onStatusChange={(next) => onStatusChange(game.id, next)}
          onVote={(value) => onVote(game.id, value)}
          onRemove={() => onRemove(game.id)}
        />
      ))}
    </div>
  );
}
