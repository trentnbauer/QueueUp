import { Link } from 'react-router-dom';
import { useNotificationFeed, useMarkAllNotificationsRead } from '../hooks/useNotifications';
import type { useSteamImport } from '../hooks/useSteamImport';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './Sidebar.module.css';

interface NotificationFlyoutProps {
  onNavigate: () => void;
  /** Shown as a status line above the notification feed while a Steam import is running or has
   * just finished (issue #359) - "click the notifications, see the import status" - reuses the
   * shared SteamImportContext instance (see Sidebar), not a separate fetch. */
  steamImport: ReturnType<typeof useSteamImport>;
}

/** The dropdown behind the QU button's badge. The feed itself only ever contains unread
 * notifications (see getNotificationFeed) - closing the flyout marks everything read (the caller,
 * Sidebar, does this - not on unmount here, since unmount isn't a reliable proxy for "the user is
 * done looking"; React 18 StrictMode alone double-fires it in development), which is what makes the
 * list empty again next time it's opened. "Dismiss all" runs that same mark-all-read action
 * immediately and clears the panel right away, without having to close and reopen it. Room-scoped
 * notifications are a shared feed (read state is a per-member cursor, not a per-row flag - see
 * notifications.ts), so this only affects your own view - the room's notification history isn't
 * private to you and nothing is deleted for other members. */
export function NotificationFlyout({ onNavigate, steamImport }: NotificationFlyoutProps) {
  const { notifications, isLoading } = useNotificationFeed(true);
  const markAllRead = useMarkAllNotificationsRead();

  // Whichever kind is actually running/just finished - activeKind is null once nothing has ever
  // run this session, in which case there's nothing to report here at all.
  const importStatus = steamImport.busy
    ? steamImport.activeKind === 'wishlist'
      ? steamImport.wishlistProgress
        ? `Importing your Steam wishlist… ${steamImport.wishlistProgress.imported} added so far`
        : 'Importing your Steam wishlist…'
      : steamImport.progress
        ? `Importing your Steam library… ${steamImport.progress.imported} added so far`
        : 'Importing your Steam library…'
    : (steamImport.result ?? steamImport.error);

  return (
    <div className={`${styles.flyout} ${styles.notifFlyout}`}>
      <div className={styles.notifHeader}>
        <span className={styles.notifTitle}>Notifications</span>
        {notifications.length > 0 && (
          <button type="button" className={styles.notifDismissAll} onClick={markAllRead}>
            Dismiss all
          </button>
        )}
      </div>
      {importStatus && (
        <div className={styles.notifImportStatus} style={!steamImport.busy && steamImport.error ? { color: '#ff8a80' } : undefined}>
          {steamImport.busy && <span className={styles.notifImportSpinner} aria-hidden="true" />}
          <span className={styles.notifImportStatusText}>{importStatus}</span>
          {/* Only once finished - result/error otherwise only clear at the *start* of the next
              import (see useSteamImport), which would otherwise leave this reading e.g. "Added 3
              games" for the rest of the session, every time the bell is reopened. */}
          {!steamImport.busy && (
            <button
              type="button"
              className={styles.notifImportDismiss}
              onClick={steamImport.dismissResult}
              aria-label="Dismiss import status"
            >
              ×
            </button>
          )}
        </div>
      )}
      <div className={styles.notifList}>
        {isLoading && <div className={styles.notifEmpty}>Loading…</div>}
        {!isLoading && notifications.length === 0 && (
          <div className={styles.notifEmpty}>
            You're all caught up - game adds, member changes, and room updates will show up here.
          </div>
        )}
        {notifications.map((n) => {
          const className = `${styles.notifItem} ${!n.read ? styles.notifUnread : ''}`;
          // Personal Shelf price alerts and release watch alerts (issue #510) are the two direct
          // (roomId-less) notification types with somewhere to navigate to - room_deleted, the
          // other direct type, has none left.
          const isPersonalShelfNotification = n.type === 'price_drop' || n.type === 'release_watch';
          const linkTo = n.roomId ? `/room/${n.roomId}` : isPersonalShelfNotification ? '/' : null;
          const body = (
            <>
              <div className={styles.notifRoomName}>{n.roomId ? n.roomName : isPersonalShelfNotification ? 'Personal Shelf' : 'Announcement'}</div>
              <div className={styles.notifMessage}>{n.message}</div>
              <div className={styles.notifTime}>{formatRelativeTime(n.createdAt)}</div>
            </>
          );
          return linkTo ? (
            <Link key={n.id} to={linkTo} className={className} onClick={onNavigate}>
              {body}
            </Link>
          ) : (
            <div key={n.id} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
