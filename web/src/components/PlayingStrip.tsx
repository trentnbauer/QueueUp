import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { GameCard } from './GameCard';
import styles from './PlayingStrip.module.css';

interface PlayingStripProps {
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

/** A compact glance at what's currently in rotation in this room (issue #229) - every game marked
 * Playing, in a horizontal strip above the main grid, so "what's this room playing right now"
 * doesn't require scanning the whole backlog for the Playing badge. Reuses GameCard itself (not a
 * lighter-weight read-only component) so clicking a card opens the exact same detail modal, with
 * the same status/vote/price/ownership actions, as the main grid below - just a different, smaller
 * arrangement of the same interactive cards, not a separate view. `Game.status` is one shared field
 * per room game (not per-member), so this shows which *games* are active, not "who" is playing
 * them - see the issue for why a per-member feed isn't a natural fit for the current data model. */
export function PlayingStrip({
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
}: PlayingStripProps) {
  const playing = games.filter((g) => g.status === 'playing');
  if (playing.length === 0) return null;

  return (
    <div className={styles.strip}>
      <div className={styles.label}>Currently Playing</div>
      <div className={styles.row}>
        {playing.map((game) => (
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
