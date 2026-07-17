import { Link } from 'react-router-dom';
import { useNotificationFeed } from '../hooks/useNotifications';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './Sidebar.module.css';

interface NotificationFlyoutProps {
  onNavigate: () => void;
}

/** The dropdown behind the SQ button's badge. Notifications keep their unread highlight for as
 * long as this stays open (so it's clear what's new); the caller (Sidebar) marks everything read
 * once the user actually closes it - not on unmount here, since unmount isn't a reliable proxy for
 * "the user is done looking" (React 18 StrictMode alone double-fires it in development). */
export function NotificationFlyout({ onNavigate }: NotificationFlyoutProps) {
  const { notifications, isLoading } = useNotificationFeed(true);

  return (
    <div className={`${styles.flyout} ${styles.notifFlyout}`}>
      <div className={styles.notifHeader}>
        <span className={styles.notifTitle}>Notifications</span>
      </div>
      <div className={styles.notifList}>
        {isLoading && <div className={styles.notifEmpty}>Loading…</div>}
        {!isLoading && notifications.length === 0 && (
          <div className={styles.notifEmpty}>
            Nothing yet - game adds, member changes, and room updates will show up here.
          </div>
        )}
        {notifications.map((n) => {
          const className = `${styles.notifItem} ${!n.read ? styles.notifUnread : ''}`;
          const body = (
            <>
              <div className={styles.notifRoomName}>{n.roomId ? n.roomName : 'Announcement'}</div>
              <div className={styles.notifMessage}>{n.message}</div>
              <div className={styles.notifTime}>{formatRelativeTime(n.createdAt)}</div>
            </>
          );
          return n.roomId ? (
            <Link key={n.id} to={`/room/${n.roomId}`} className={className} onClick={onNavigate}>
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
