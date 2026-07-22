import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { GameCard } from './GameCard';
import styles from './PlayingStrip.module.css';

interface BeatenStripProps {
  games: Game[];
  currentUserId: string;
  memberCount?: number;
  roomMembers?: User[];
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
  onRefreshPrice: (gameId: string) => void;
  isRefreshingPrice?: (gameId: string) => boolean;
  onSetTargetPrice: (gameId: string, targetPrice: string | null) => void;
  onSetOwnership?: (gameId: string, owned: boolean) => void;
}

/** Mirrors PlayingStrip, but for games marked Done, and sits below the main grid instead of above
 * it - a room's "what have we already finished" belongs at the bottom, out of the way, rather than
 * competing with Currently Playing for the top spot. Reuses PlayingStrip's stylesheet since the
 * layout (a horizontal strip of cards with a label) is identical, just a different filter/position. */
export function BeatenStrip({
  games,
  currentUserId,
  memberCount,
  roomMembers,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  isRefreshingPrice,
  onSetTargetPrice,
  onSetOwnership,
}: BeatenStripProps) {
  // Most recently marked Done first, so the strip reads as a completion timeline rather than
  // whatever order the games happened to come back in - same signal lastCompletedPrimaryGenre in
  // gameGridLogic.ts already uses as "the last completed game."
  const done = games
    .filter((g) => g.status === 'done')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  if (done.length === 0) return null;

  return (
    <div className={styles.strip}>
      <div className={styles.label}>Beaten</div>
      <div className={styles.row}>
        {done.map((game) => (
          <div key={game.id} className={styles.item}>
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
          </div>
        ))}
      </div>
    </div>
  );
}
