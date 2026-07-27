import type { Game, GameStatus, User, VoteValue } from '@queueup/shared';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { GameListRow } from './GameListRow';
import { ActionErrorBanner } from './ActionErrorBanner';
import { backlogGames, sortByScore } from './gameGridLogic';
import styles from './RankedQueueModal.module.css';

interface RankedQueueModalProps {
  games: Game[];
  currentUserId: string;
  memberCount?: number;
  roomMembers?: User[];
  /** Surfaced here (issue #360) rather than relying on the page behind the modal to show it - the
   * page's own ActionErrorBanner (rendered by RoomView/ShelfView from a *separate* useGames
   * instance) has no way to know about a mutation fired from in here. */
  actionError: string | null;
  onDismissActionError: () => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onVote: (gameId: string, value: VoteValue) => void;
  onRemove: (gameId: string) => void;
  onRefreshPrice: (gameId: string) => void;
  isRefreshingPrice?: (gameId: string) => boolean;
  onSetSteamMatch: (gameId: string, steamAppId: number | null) => void;
  onSetTargetPrice: (gameId: string, targetPrice: string | null) => void;
  onSetOwnership?: (gameId: string, owned: boolean) => void;
  onApplyTag: (gameId: string, name: string) => Promise<void>;
  onRemoveTag: (gameId: string, tagId: string) => void;
  onSetPrerequisite?: (gameId: string, prerequisiteGameId: string | null) => void;
  onClose: () => void;
}

/** Deterministic alternative to Spin the Wheel (issue #360) - lists the exact same eligible pool
 * the wheel draws from (backlogGames: backlog + queued-for-replay, released, no unmet "play after"
 * prerequisite), in the same sortByScore priority order its own weighting is built on top of, for
 * a group that would rather just see "what's actually top of the queue" than leave it to chance.
 * Always live (unlike the main grid's session-frozen order - see GameGrid's useStableOrder) since
 * this is opened on demand specifically to check the current ranking, not left on screen to watch
 * reshuffle under you. Reuses GameListRow (not a lighter read-only row) so every entry is exactly
 * as interactive as the main grid - voting or changing status from here uses the same mutations. */
export function RankedQueueModal({
  games,
  currentUserId,
  memberCount,
  roomMembers,
  actionError,
  onDismissActionError,
  onStatusChange,
  onVote,
  onRemove,
  onRefreshPrice,
  isRefreshingPrice,
  onSetSteamMatch,
  onSetTargetPrice,
  onSetOwnership,
  onApplyTag,
  onRemoveTag,
  onSetPrerequisite,
  onClose,
}: RankedQueueModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const ranked = sortByScore(backlogGames(games));

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Ranked Queue"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>📋 Ranked Queue</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <ActionErrorBanner message={actionError} onDismiss={onDismissActionError} />

        {ranked.length === 0 ? (
          <div className={styles.empty}>Add a backlog game to see it ranked here.</div>
        ) : (
          <div className={styles.list}>
            {ranked.map((game, i) => (
              <div key={game.id} className={styles.row}>
                <span className={styles.rank}>{i + 1}</span>
                <div className={styles.rowGame}>
                  <GameListRow
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
                    onSetOwnership={onSetOwnership ? (owned) => onSetOwnership(game.id, owned) : undefined}
                    onApplyTag={(name) => onApplyTag(game.id, name)}
                    onRemoveTag={(tagId) => onRemoveTag(game.id, tagId)}
                    roomGames={games}
                    onSetPrerequisite={
                      onSetPrerequisite ? (prerequisiteGameId) => onSetPrerequisite(game.id, prerequisiteGameId) : undefined
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
