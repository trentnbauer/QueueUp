import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { GameCard } from './GameCard';
import { upcomingReleases } from './gameGridLogic';
import { formatCountdown } from '../utils/relativeTime';
import styles from './ComingSoonStrip.module.css';

interface ComingSoonStripProps {
  games: Game[];
  currentUserId: string;
  memberCount?: number;
  roomMembers?: User[];
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
  onRefreshPrice: (gameId: string) => void;
  isRefreshingPrice?: (gameId: string) => boolean;
  onSetSteamMatch: (gameId: string, steamAppId: number | null) => void;
  onSetTargetPrice: (gameId: string, targetPrice: string | null) => void;
  onSetManualPrice: (gameId: string, manualPrice: string | null) => void;
  onSetOwnership?: (gameId: string, owned: boolean) => void;
  onApplyTag: (gameId: string, name: string) => Promise<void>;
  onRemoveTag: (gameId: string, tagId: string) => void;
  onSetPrerequisite?: (gameId: string, prerequisiteGameId: string | null) => void;
}

/** A glance at what's releasing soon (issue #367) - every Wishlist/Backlog game with a known,
 * still-upcoming releaseDate, soonest first, in a horizontal strip above the main grid. Exact
 * release dates are already captured and used to exclude unreleased games from Spin the Wheel
 * (see isUnreleased/backlogGames) - this just surfaces that same data the other direction, so
 * there's actually a way to see what's coming up instead of only what's excluded. Reuses GameCard
 * itself unmodified (same reasoning as PlayingStrip/BeatenStrip/DroppedStrip) so clicking a card
 * opens the exact same detail modal; the countdown is a badge overlaid on top of it here, not a
 * change to the card itself, since a countdown is only the point in this one strip. */
export function ComingSoonStrip({
  games,
  currentUserId,
  memberCount,
  roomMembers,
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
}: ComingSoonStripProps) {
  const upcoming = upcomingReleases(games);
  if (upcoming.length === 0) return null;

  return (
    <div className={styles.strip}>
      <div className={styles.label}>Coming Soon</div>
      <div className={styles.row}>
        {upcoming.map((game) => (
          <div key={game.id} className={styles.item}>
            {/* releaseDate is guaranteed non-null here - see upcomingReleases' own filter. */}
            <div className={styles.countdown}>{formatCountdown(game.releaseDate as string)}</div>
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
              onSetSteamMatch={(steamAppId) => onSetSteamMatch(game.id, steamAppId)}
              onSetTargetPrice={(targetPrice) => onSetTargetPrice(game.id, targetPrice)}
              onSetManualPrice={(manualPrice) => onSetManualPrice(game.id, manualPrice)}
              onSetOwnership={onSetOwnership ? (owned) => onSetOwnership(game.id, owned) : undefined}
              onApplyTag={(name) => onApplyTag(game.id, name)}
              onRemoveTag={(tagId) => onRemoveTag(game.id, tagId)}
              roomGames={games}
              onSetPrerequisite={onSetPrerequisite ? (prerequisiteGameId) => onSetPrerequisite(game.id, prerequisiteGameId) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
