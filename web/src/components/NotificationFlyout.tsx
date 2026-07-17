import { Link } from 'react-router-dom';
import { useNotificationFeed, useMarkAllNotificationsRead } from '../hooks/useNotifications';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './Sidebar.module.css';

interface NotificationFlyoutProps {
  onNavigate: () => void;
}

/** The dropdown behind the SQ button's badge. The feed itself only ever contains unread
 * notifications (see getNotificationFeed) - closing the flyout marks everything read (the caller,
 * Sidebar, does this - not on unmount here, since unmount isn't a reliable proxy for "the user is
 * done looking"; React 18 StrictMode alone double-fires it in development), which is what makes the
 * list empty again next time it's opened. "Dismiss all" runs that same mark-all-read action
 * immediately and clears the panel right away, without having to close and reopen it. Room-scoped
 * notifications are a shared feed (read state is a per-member cursor, not a per-row flag - see
 * notifications.ts), so this only affects your own view - the room's notification history isn't
 * private to you and nothing is deleted for other members. */
export function NotificationFlyout({ onNavigate }: NotificationFlyoutProps) {
  const { notifications, isLoading } = useNotificationFeed(true);
  const markAllRead = useMarkAllNotificationsRead();

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
      <div className={styles.notifList}>
        {isLoading && <div className={styles.notifEmpty}>Loading…</div>}
        {!isLoading && notifications.length === 0 && (
          <div className={styles.notifEmpty}>
            You're all caught up - game adds, member changes, and room updates will show up here.
          </div>
        )}
        {notifications.map((n) => {
          const className = `${styles.notifItem} ${!n.read ? styles.notifUnread : ''}`;
          // Personal Shelf price alerts are the one direct (roomId-less) notification type with
          // somewhere to navigate to - room_deleted, the other direct type, has none left.
          const linkTo = n.roomId ? `/room/${n.roomId}` : n.type === 'price_drop' ? '/' : null;
          const body = (
            <>
              <div className={styles.notifRoomName}>{n.roomId ? n.roomName : n.type === 'price_drop' ? 'Personal Shelf' : 'Announcement'}</div>
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
