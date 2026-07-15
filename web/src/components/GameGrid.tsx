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
function playNextGames(games: Game[]): Game[] {
  return sortByScore(games.filter((g) => g.status === 'backlog' && g.voteScore > 0)).slice(0, 3);
}

// IGDB genre strings are comma-joined and often carry several tags (e.g. "Shooter, Adventure");
// comparing the full tag set for zero overlap is too strict in practice — broad secondary tags
// like "Adventure" or "Indie" show up on all sorts of otherwise-unrelated games and would mask an
// otherwise clearly different pick. The first-listed tag is IGDB's primary genre for the game, so
// that's what "different genre" compares.
function primaryGenre(genre: string | null): string | null {
  const first = (genre ?? '').split(',')[0]?.trim().toLowerCase();
  return first || null;
}

/** Among the current Play Next picks, the highest-scored one whose primary genre differs from the
 * most-recently-completed game's — e.g. last completed was a shooter, play-next top-3 are
 * shooter/shooter/puzzle, recommend the puzzle one. No recommendation if nothing's been completed
 * yet, the last completed game has no genre data, or every play-next pick shares its primary genre. */
function recommendedNextId(games: Game[], candidates: Game[]): string | null {
  const completed = games.filter((g) => g.status === 'done');
  if (completed.length === 0) return null;

  const lastCompleted = completed.reduce((latest, g) =>
    new Date(g.updatedAt).getTime() > new Date(latest.updatedAt).getTime() ? g : latest,
  );
  const lastPrimary = primaryGenre(lastCompleted.genre);
  if (!lastPrimary) return null;

  const differing = candidates.find((g) => {
    const primary = primaryGenre(g.genre);
    return primary !== null && primary !== lastPrimary;
  });
  return differing?.id ?? null;
}

/** Currently Playing first, then Play Next-tagged backlog, then the rest of the backlog, then
 * Completed last. Layered on top of the frozen order via a stable sort (bucket only, no
 * re-scoring), so games keep their relative position within a bucket — this reacts live to status
 * changes (a deliberate, rare, self-performed action) while #17's frozen order still governs
 * anything score-driven within a bucket. */
function statusBucket(game: Game, playNext: Set<string>): number {
  if (game.status === 'playing') return 0;
  if (game.status === 'backlog' && playNext.has(game.id)) return 1;
  if (game.status === 'backlog') return 2;
  return 3; // done
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
}

export function GameGrid({ games, currentUserId, isLoading, memberCount, onStatusChange, onVote, onRemove }: GameGridProps) {
  const sorted = useStableOrder(games);
  const candidates = playNextGames(games);
  const playNext = new Set(candidates.map((g) => g.id));
  const recommendedId = recommendedNextId(games, candidates);
  const prioritized = [...sorted].sort((a, b) => statusBucket(a, playNext) - statusBucket(b, playNext));

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
        />
      ))}
    </div>
  );
}
