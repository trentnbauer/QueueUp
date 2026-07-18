import { useState } from 'react';
import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { GameDetailModal } from './GameDetailModal';
import { formatPrice } from '../utils/formatPrice';
import styles from './GameCard.module.css';

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
}: GameCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <div className={styles.card} onClick={() => setDetailOpen(true)} role="button" aria-label={game.title} title={game.title}>
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
          {!game.coverImageUrl && <span className={styles.coverLabel}>COVER ART</span>}

          {/* Playing hides price/owned info entirely - the ribbon already answers "what's going on
              with this game," and "should I buy it" isn't relevant once you're playing it. */}
          {game.status !== 'playing' && (
            <div className={styles.coverOverlay}>
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
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}
