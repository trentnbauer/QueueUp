import { useState } from 'react';
import { VOTE_SCALE, type Game, type GameStatus, type User, type VoteValue } from '@queueup/shared';
import { GameDetailModal } from './GameDetailModal';
import { formatPrice } from '../utils/formatPrice';
import { NEGLECTED_BACKLOG_MONTHS, isNeglectedBacklogGame } from './gameGridLogic';
import styles from './GameCard.module.css';

/** The squad's overall read on a game, for the card-face badge (issue #206) - the average cast
 * vote (rounded to the nearest whole scale value) drives which emoji shows, so the badge reads as
 * "here's the room's mood" rather than just a raw score total. */
function averageVoteValue(votes: Game['votes']): VoteValue | null {
  if (votes.length === 0) return null;
  const mean = votes.reduce((sum, v) => sum + v.value, 0) / votes.length;
  return Math.min(5, Math.max(1, Math.round(mean))) as VoteValue;
}

interface GameCardProps {
  game: Game;
  currentUserId: string;
  memberCount?: number;
  roomMembers?: User[];
  onStatusChange: (status: GameStatus) => void;
  onVote: (value: VoteValue) => void;
  onRemove: () => void;
  onRefreshPrice: () => void;
  /** Drives the refresh button's spinner. Defaults to false (e.g. contexts that don't track it). */
  isRefreshingPrice?: boolean;
  /** Sets (or clears, with null) the price to alert at (issue #162) - only offered for games with
   * a live tracked price, since there's nothing to compare a target against otherwise. */
  onSetTargetPrice: (targetPrice: string | null) => void;
  /** Toggles the current user's ownership claim on this game (issue #173) - only offered for room
   * games (game.ownership is null on the Personal Shelf, where there's no group to count). */
  onSetOwnership?: (owned: boolean) => void;
  /** Finds-or-creates a tag by name and applies it to this game (issue #247). */
  onApplyTag: (name: string) => Promise<void>;
  onRemoveTag: (tagId: string) => void;
  /** Bulk-select mode (issue #205, Personal Shelf only) - while active, clicking the card toggles
   * selection instead of opening the detail modal. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

/** The card face itself is deliberately minimal (cover art plus price/owned) so a grid of games
 * stays scannable - everything else (title, genre, price detail, votes, ownership, status,
 * remove) lives in GameDetailModal, opened by clicking the card. */
export function GameCard({
  game,
  currentUserId,
  memberCount,
  roomMembers,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  isRefreshingPrice = false,
  onSetTargetPrice,
  onSetOwnership,
  onApplyTag,
  onRemoveTag,
  selectable = false,
  selected = false,
  onToggleSelect,
}: GameCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const avgVote = averageVoteValue(game.votes);
  const neglected = isNeglectedBacklogGame(game);

  function handleCardClick() {
    if (selectable) {
      onToggleSelect?.();
      return;
    }
    setDetailOpen(true);
  }

  return (
    <>
      <div
        className={`${styles.card} ${selectable && selected ? styles.cardSelected : ''}`}
        onClick={handleCardClick}
        role="button"
        aria-label={game.title}
        title={game.title}
      >
        {selectable && (
          <input
            type="checkbox"
            className={styles.selectCheckbox}
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect?.()}
            aria-label={`Select ${game.title}`}
          />
        )}
        {game.status === 'done' && (
          <div className={styles.ribbon} aria-hidden="true">
            <span className={`${styles.ribbonText} ${styles.beatenRibbonText}`}>Beaten</span>
          </div>
        )}
        {game.status === 'playing' && (
          <div className={styles.ribbon} aria-hidden="true">
            <span className={`${styles.ribbonText} ${styles.playingRibbonText}`}>Playing</span>
          </div>
        )}

        <div
          className={styles.cover}
          style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
        >
          {!game.coverImageUrl && <span className={styles.coverLabel}>{game.title}</span>}

          {/* "Collecting dust" nudge (issue #249) - backlog games Year in Review would otherwise
              only ever call out once a year. Top-left, opposite the vote badge's bottom-right spot
              and clear of the selection checkbox (top-left too, but only rendered in bulk-select
              mode, which backlog games can still be in - selectable takes priority visually since
              it's interactive and this is purely informational). */}
          {neglected && !selectable && (
            <div
              className={styles.dustBadge}
              title={`Added ${NEGLECTED_BACKLOG_MONTHS}+ months ago with no vote or status change since`}
            >
              <span aria-hidden="true">🕸</span> Collecting dust
            </div>
          )}

          {avgVote !== null && (
            <div
              className={styles.voteBadge}
              title={`Squad vote: ${VOTE_SCALE[avgVote]} average, ${game.voteScore >= 0 ? '+' : ''}${game.voteScore} score from ${game.votes.length} vote${game.votes.length === 1 ? '' : 's'}`}
            >
              <span className={styles.voteBadgeEmoji} aria-hidden="true">
                {VOTE_SCALE[avgVote]}
              </span>
              <span className={styles.voteBadgeScore}>
                {game.voteScore >= 0 ? '+' : ''}
                {game.voteScore}
              </span>
            </div>
          )}

          {/* Playing hides price/owned info entirely - the ribbon already answers "what's going on
              with this game," and "should I buy it" isn't relevant once you're playing it. */}
          {game.status !== 'playing' && (
            <div className={styles.coverOverlay}>
              {game.ownership && game.ownership.total > 1 && game.ownership.owned === game.ownership.total && (
                <div className={styles.everyoneOwnsLine}>Everyone owns this</div>
              )}
              {game.youOwn ? (
                <div className={styles.ownedLine}>
                  <span className={styles.ownedLabel}>Owned</span>
                  <span className={styles.ownedPriceHint}>{formatPrice(game)}</span>
                </div>
              ) : (
                <div className={styles.priceLine}>
                  <span aria-hidden="true">🎮</span>
                  {formatPrice(game)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {detailOpen && (
        <GameDetailModal
          game={game}
          currentUserId={currentUserId}
          memberCount={memberCount}
          roomMembers={roomMembers}
          onStatusChange={onStatusChange}
          onVote={onVote}
          onRemove={onRemove}
          onRefreshPrice={onRefreshPrice}
          isRefreshingPrice={isRefreshingPrice}
          onSetTargetPrice={onSetTargetPrice}
          onSetOwnership={onSetOwnership}
          onApplyTag={onApplyTag}
          onRemoveTag={onRemoveTag}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}
