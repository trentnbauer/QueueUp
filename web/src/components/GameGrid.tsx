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

interface GameGridProps {
  games: Game[];
  currentUserId: string;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
}

export function GameGrid({ games, currentUserId, onStatusChange, onVote, onRemove }: GameGridProps) {
  const sorted = sortByScore(games);

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
          onStatusChange={(next) => onStatusChange(game.id, next)}
          onVote={(value) => onVote(game.id, value)}
          onRemove={() => onRemove(game.id)}
        />
      ))}
    </div>
  );
}
