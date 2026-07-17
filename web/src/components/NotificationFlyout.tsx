import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNotificationFeed } from '../hooks/useNotifications';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './Sidebar.module.css';

interface NotificationFlyoutProps {
  onNavigate: () => void;
}

/** The dropdown behind the SQ button's badge. Notifications keep their unread highlight for as
 * long as this stays open (so it's clear what's new), and are marked read as a batch once it
 * closes - simpler than tracking each item's read state individually as they're scrolled past. */
export function NotificationFlyout({ onNavigate }: NotificationFlyoutProps) {
  const { notifications, isLoading, markAllRead } = useNotificationFeed(true);

  useEffect(() => {
    return () => {
      markAllRead.mutate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
