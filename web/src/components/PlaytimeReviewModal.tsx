import { suggestsPlayingFromMinutes, suggestsBeatenFromMinutes, type Game, type GameStatus } from '@queueup/shared';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { usePlaytimeReview } from '../hooks/usePlaytimeReview';
import styles from './PlaytimeReviewModal.module.css';

interface ReviewEntry {
  game: Game;
  currentMinutes: number;
}

interface PlaytimeReviewDialogProps {
  entries: ReviewEntry[];
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onClose: () => void;
}

// Same reasoning as ChangelogModal's separate dialog component - useModalA11y must run
// unconditionally, so it only mounts/unmounts alongside the dialog itself.
function PlaytimeReviewDialog({ entries, onStatusChange, onClose }: PlaytimeReviewDialogProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Review played games"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.title}>Played anything?</div>
        <p className={styles.subtitle}>Steam says these picked up playtime since we last checked.</p>

        <ul className={styles.list}>
          {entries.map(({ game, currentMinutes }) => (
            <li key={game.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemTitle}>{game.title}</span>
                <span className={styles.itemHours}>{Math.round(currentMinutes / 60)}h played</span>
              </div>
              {/* Judged against currentMinutes (this game's raw total), not the checkpoint-relative
                  figure GameDetailModal's individual nudge uses - a game with no prior checkpoint
                  at all (e.g. its first-ever sync) would otherwise show up in this list with no
                  working buttons, since that figure is deliberately 0 until something actually
                  checkpoints it. See suggestsPlayingFromMinutes/suggestsBeatenFromMinutes. */}
              {suggestsPlayingFromMinutes(game.status, game.roomId, currentMinutes) && (
                <button type="button" className={styles.actionButton} onClick={() => onStatusChange(game.id, 'playing')}>
                  Mark Playing
                </button>
              )}
              {suggestsBeatenFromMinutes(game.status, game.timeToBeatHours, currentMinutes) && (
                <button type="button" className={styles.actionButton} onClick={() => onStatusChange(game.id, 'done')}>
                  Mark Beaten
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <button type="button" className={styles.confirmButton} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

interface PlaytimeReviewModalProps {
  games: Game[];
  onStatusChange: (gameId: string, status: GameStatus) => void;
}

/** Auto-popup batch "review your played games" prompt (issue #548), mirroring ChangelogModal's
 * shape but scoped to the Personal Shelf - mount this alongside a shelf's game list (it has no
 * standalone footer trigger like "What's new"; there's nothing to manually re-open once the
 * one-time first-sync view has been dismissed, only new increases bring it back). See
 * usePlaytimeReview.ts for the first-sync-vs-incremental logic. */
export function PlaytimeReviewModal({ games, onStatusChange }: PlaytimeReviewModalProps) {
  const { entries, markReviewed } = usePlaytimeReview(games);

  if (entries.length === 0) return null;

  return <PlaytimeReviewDialog entries={entries} onStatusChange={onStatusChange} onClose={markReviewed} />;
}
