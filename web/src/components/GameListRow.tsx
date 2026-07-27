import { useEffect, useState } from 'react';
import { VOTE_SCALE, type Game, type GameStatus, type User, type VoteValue } from '@queueup/shared';
import { GameDetailModal } from './GameDetailModal';
import { formatPrice } from '../utils/formatPrice';
import { GAME_STATUS_LABEL } from './gameGridLogic';
import styles from './GameListRow.module.css';

interface GameListRowProps {
  game: Game;
  currentUserId: string;
  memberCount?: number;
  roomMembers?: User[];
  onStatusChange: (status: GameStatus) => void;
  onVote: (value: VoteValue) => void;
  onRemove: () => void;
  onRefreshPrice: () => void;
  isRefreshingPrice?: boolean;
  onSetSteamMatch: (steamAppId: number | null) => void;
  onSetTargetPrice: (targetPrice: string | null) => void;
  onSetManualPrice: (manualPrice: string | null) => void;
  onSetOwnership?: (owned: boolean) => void;
  onApplyTag: (name: string) => Promise<void>;
  onRemoveTag: (tagId: string) => void;
  roomGames?: Game[];
  onSetPrerequisite?: (prerequisiteGameId: string | null) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

/** Row-per-game alternative to GameCard's cover-art tile (issue #344) - same click-to-open-detail
 * interaction and the same props, but laid out so review score, squad votes, ownership, and
 * time-to-beat are all readable at a glance instead of needing to open every game to compare them.
 * Kept as a sibling to GameCard rather than a CSS-only reflow of it, since a list row surfaces
 * fields the card face deliberately leaves out (see GameCard's own comment on why it's minimal). */
export function GameListRow({
  game,
  currentUserId,
  memberCount,
  roomMembers,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  isRefreshingPrice = false,
  onSetSteamMatch,
  onSetTargetPrice,
  onSetManualPrice,
  onSetOwnership,
  onApplyTag,
  onRemoveTag,
  roomGames,
  onSetPrerequisite,
  selectable = false,
  selected = false,
  onToggleSelect,
}: GameListRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  // Same broken-cover fallback as GameCard - see its own comment for why a probe <img> is needed
  // alongside the CSS background-image.
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => {
    setCoverFailed(false);
  }, [game.coverImageUrl]);

  function handleRowClick() {
    if (selectable) {
      onToggleSelect?.();
      return;
    }
    setDetailOpen(true);
  }

  const everyoneOwns = game.ownership && game.ownership.total > 1 && game.ownership.owned === game.ownership.total;

  return (
    <>
      <div
        className={`${styles.row} ${selectable && selected ? styles.rowSelected : ''}`}
        onClick={handleRowClick}
        role="button"
        aria-label={game.title}
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

        <div
          className={styles.thumb}
          style={game.coverImageUrl && !coverFailed ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
        >
          {game.coverImageUrl && !coverFailed && (
            <img
              src={game.coverImageUrl}
              alt=""
              aria-hidden="true"
              className={styles.thumbProbe}
              onError={() => setCoverFailed(true)}
            />
          )}
          {(!game.coverImageUrl || coverFailed) && <span className={styles.thumbFallback}>{game.title[0]?.toUpperCase()}</span>}
        </div>

        <div className={styles.titleCell}>
          <span className={styles.title}>{game.title}</span>
          <span className={styles.subtitle}>
            {game.platform}
            {game.genre ? ` · ${game.genre}` : ''}
          </span>
        </div>

        <span className={`${styles.statusBadge} ${styles[`status-${game.status}`]}`}>{GAME_STATUS_LABEL[game.status]}</span>

        <span className={styles.stat} title={game.reviewScore !== null ? `IGDB review score: ${game.reviewScore}/100` : 'No review score on file'}>
          {game.reviewScore !== null ? `⭐ ${game.reviewScore}/100` : '—'}
        </span>

        <span
          className={styles.stat}
          title={`Squad vote score, from ${game.votes.length} vote${game.votes.length === 1 ? '' : 's'}`}
        >
          {game.votes.length > 0 ? `${game.voteScore >= 0 ? '+' : ''}${game.voteScore} pts` : '—'}
        </span>

        <span className={styles.stat}>
          {game.ownership ? (
            <span className={everyoneOwns ? styles.everyoneOwns : undefined}>
              {game.ownership.owned}/{game.ownership.total} own it
            </span>
          ) : game.youOwn ? (
            'Owned'
          ) : (
            '—'
          )}
        </span>

        <span className={styles.stat} title="Main-story time-to-beat, from IGDB">
          {game.timeToBeatHours !== null ? `${game.timeToBeatHours}h` : '—'}
        </span>

        <span className={styles.stat}>{game.status !== 'playing' ? formatPrice(game) : '—'}</span>
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
          onSetSteamMatch={onSetSteamMatch}
          onSetTargetPrice={onSetTargetPrice}
          onSetManualPrice={onSetManualPrice}
          onSetOwnership={onSetOwnership}
          onApplyTag={onApplyTag}
          onRemoveTag={onRemoveTag}
          roomGames={roomGames}
          onSetPrerequisite={onSetPrerequisite}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}
