import { Link } from 'react-router-dom';
import type { Game } from '@queueup/shared';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { formatPrice } from '../utils/formatPrice';
import { GAME_STATUS_LABEL } from './gameGridLogic';
import styles from './CurrentlyPlayingGameModal.module.css';

interface CurrentlyPlayingGameModalProps {
  game: Game;
  /** Null for a Personal Shelf game, same convention as CurrentlyPlayingView's own groups. */
  roomId: string | null;
  roomName: string | null;
  onClose: () => void;
}

/** A read-only preview for a game clicked from the cross-room Currently Playing dashboard (issue
 * #457) - clicking a game there used to jump straight to its room/shelf, which is jarring when
 * you just want a quick look at what it is. Deliberately not the full interactive GameDetailModal:
 * that needs a room-scoped mutation hook (status changes, voting, tags, ...) wired up per room,
 * which this cross-room view has no single room context to provide - see
 * CurrentlyPlayingView's own doc comment. "Go to room/shelf" below is what gets you to the real,
 * interactive card. */
export function CurrentlyPlayingGameModal({ game, roomId, roomName, onClose }: CurrentlyPlayingGameModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={game.title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>{game.title}</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.cover} style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}>
            {!game.coverImageUrl && <span className={styles.coverFallback}>{game.title[0]?.toUpperCase()}</span>}
          </div>

          <div className={styles.meta}>
            <span className={`${styles.statusBadge} ${game.status === 'play_next' ? styles.statusBadgePlayNext : ''}`}>
              {GAME_STATUS_LABEL[game.status]}
            </span>
            <span className={styles.metaLine}>
              {game.platform}
              {game.genre ? ` · ${game.genre}` : ''}
            </span>
            <span className={styles.metaLine}>{formatPrice(game)}</span>
            {game.tags.length > 0 && (
              <div className={styles.tags}>
                {game.tags.map((tag) => (
                  <span key={tag.id} className={styles.tag}>
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <Link to={roomId ? `/room/${roomId}` : '/'} className={styles.goToLink} onClick={onClose}>
          Go to {roomName ?? 'Personal Shelf'} →
        </Link>
      </div>
    </div>
  );
}
