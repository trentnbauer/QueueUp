import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ROOM_PLATFORM_LABELS } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useRooms } from '../hooks/useRooms';
import { useNotificationSummary, useMarkAllNotificationsRead } from '../hooks/useNotifications';
import { usePendingImportsCount } from '../hooks/usePendingImports';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useThemeMode } from '../context/ThemeModeContext';
import { authApi } from '../api/auth';
import { AvatarBadge } from './AvatarBadge';
import { Logo } from './Logo';
import { AddRoomModal } from './AddRoomModal';
import { NotificationFlyout } from './NotificationFlyout';
import { contrastTextColor } from '../utils/color';
import styles from './Sidebar.module.css';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Discord-style server rail: rooms (and the Personal Shelf) live as icons in a vertical strip on
 * the far left, with account controls anchored to the bottom - instead of dropdown menus for
 * switching rooms and reaching profile settings. */
export function Sidebar() {
  const { user } = useAuth();
  const { activeRoom } = useView();
  // /playing (issue #364) isn't tracked in ViewContext (it's not a shelf/room, just an aggregate
  // view over them), so its icon's active state is checked directly against the URL instead.
  const onPlayingPage = useLocation().pathname === '/playing';
  const onBeatenPage = useLocation().pathname === '/beaten';
  const onReviewPage = useLocation().pathname === '/review';
  const onAchievementsPage = useLocation().pathname === '/achievements';
  const { rooms } = useRooms();
  const { totalUnread, unreadRoomIds } = useNotificationSummary();
  // Badge on the Needs Review icon (see NeedsReviewView) - the review queue used to live silently
  // inside Profile Settings with nothing anywhere else hinting it needed attention.
  const pendingReviewCount = usePendingImportsCount();
  const markAllNotificationsRead = useMarkAllNotificationsRead();
  const { mode, toggle: toggleThemeMode } = useThemeMode();
  // Issue #359: a Steam library/wishlist import can run for minutes in the background (see
  // useSteamImport) with nothing visible once the person's navigated away from the button that
  // started it - this surfaces it as a spinner on the same bell every screen already has, rather
  // than only being visible from the Personal Shelf header.
  const steamImport = useSteamImportContext();

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  // Below the 640px breakpoint the rail becomes an off-canvas drawer (hidden by default, toggled
  // by a fixed hamburger button) instead of just shrinking icon sizes - a permanent, always-visible
  // vertical strip claims too much width on a phone screen for navigation that's used rarely
  // relative to the game grid content. No effect above that breakpoint (CSS keeps the rail docked
  // and this state unused).
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeNotifications() {
    if (showNotifications) markAllNotificationsRead();
    setShowNotifications(false);
  }

  // The notification flyout is only reachable from inside the drawer, so leaving it open past the
  // drawer closing just strands it floating over the page with no way to see what it's anchored
  // to - close it alongside the drawer itself, however the drawer gets closed.
  function closeMobileDrawer() {
    setMobileOpen(false);
    closeNotifications();
  }

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        className={styles.mobileToggle}
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileOpen}
        onClick={() => (mobileOpen ? closeMobileDrawer() : setMobileOpen(true))}
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {mobileOpen && <div className={styles.mobileBackdrop} onClick={closeMobileDrawer} />}

      <nav className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`} aria-label="Rooms">
        <div className={styles.brandMenu}>
          <button
            type="button"
            className={styles.brand}
            title={steamImport.busy ? 'Importing your Steam library…' : 'QueueUp'}
            aria-label={totalUnread > 0 ? `Notifications (${totalUnread} unread)` : 'Notifications'}
            onClick={() => (showNotifications ? closeNotifications() : setShowNotifications(true))}
          >
            <Logo size={44} />
            {steamImport.busy && <span className={styles.importSpinner} aria-hidden="true" />}
            {totalUnread > 0 && <span className={styles.unreadDot} aria-hidden="true" />}
          </button>
          {showNotifications && (
            <>
              <div className={styles.menuBackdrop} onClick={closeNotifications} />
              <NotificationFlyout onNavigate={closeMobileDrawer} steamImport={steamImport} />
            </>
          )}
        </div>
        <div className={styles.divider} />

        <div className={styles.icons}>
          {/* Personal Shelf, plus the cross-room Currently Playing (issue #364) and Beaten (issue
              #481) dashboards - originally three separate icons here, merged into one destination
              (issue #490) with ShelfTabs switching between them, since all three are really just
              different views of "your games." */}
          <Link
            to="/"
            className={`${styles.roomIcon} ${(!activeRoom || onPlayingPage || onBeatenPage) && !onReviewPage && !onAchievementsPage ? styles.roomIconActive : ''}`}
            title="Personal Shelf"
            onClick={closeMobileDrawer}
          >
            🗂
          </Link>

          {/* QueueUp's own gamification panel (issue #489) - a dedicated icon rather than folding
              into ShelfTabs alongside Shelf/Playing/Beaten (issue #490), since this is a distinct
              hub of its own (milestones across everything you do here) rather than another view of
              "your games" specifically. Always shown, same reasoning as Playing/Beaten before they
              merged: a glance at what's still locked is meaningful even before you've unlocked much. */}
          <Link
            to="/achievements"
            className={`${styles.roomIcon} ${onAchievementsPage ? styles.roomIconActive : ''}`}
            title="Achievements"
            onClick={closeMobileDrawer}
          >
            🏆
          </Link>

          {/* Needs Review queue (unmatched import titles) - used to live silently inside Profile
              Settings; a top-level icon with a badge (matching the notification-dot pattern below)
              makes it visible from anywhere instead of only to someone who thinks to check settings.
              Hidden entirely when there's nothing to review - unlike Currently Playing (always
              useful as a glance, empty or not), an empty review queue is the common case and
              permanent rail space for it would just be noise most users never act on. */}
          {pendingReviewCount > 0 && (
            <Link
              to="/review"
              className={`${styles.roomIcon} ${onReviewPage ? styles.roomIconActive : ''}`}
              title={`Needs Review (${pendingReviewCount})`}
              onClick={closeMobileDrawer}
            >
              🧩
              <span className={styles.unreadDot} aria-hidden="true" />
            </Link>
          )}

          {rooms.map((room) => (
            <Link
              key={room.id}
              to={`/room/${room.id}`}
              className={`${styles.roomIcon} ${activeRoom?.id === room.id && !onPlayingPage && !onBeatenPage && !onAchievementsPage ? styles.roomIconActive : ''}`}
              style={{ background: room.accentColor, color: contrastTextColor(room.accentColor) }}
              title={`${room.name} · ${room.platform ? ROOM_PLATFORM_LABELS[room.platform] : 'Any platform'}`}
              onClick={closeMobileDrawer}
            >
              {initials(room.name)}
              {unreadRoomIds.has(room.id) && <span className={styles.unreadDot} aria-hidden="true" />}
            </Link>
          ))}
        </div>

        <button
          type="button"
          className={styles.addRoomIcon}
          title="Create or join a room"
          aria-label="Create or join a room"
          onClick={() => {
            closeMobileDrawer();
            setShowAddRoom(true);
          }}
        >
          {/* A literal "+" glyph sits noticeably off-center due to font metrics - drawn as two
              CSS bars instead for pixel-perfect centering regardless of font. Decorative only;
              the button's own aria-label carries the accessible name. */}
          <span className={styles.addRoomPlus} aria-hidden="true" />
        </button>

        <div className={`${styles.menu} ${styles.profileMenu}`}>
          <button
            type="button"
            className={styles.userPanel}
            aria-label={`Signed in as ${user.displayName}`}
            onClick={() => setShowProfileMenu((v) => !v)}
          >
            <AvatarBadge name={user.displayName} color={user.avatarColor} avatarUrl={user.avatarUrl} size={36} />
          </button>
          {showProfileMenu && (
            <>
              {/* Full-screen click-catcher to close the flyout on any outside click, without a
                  library - sits behind the flyout itself (lower in the DOM = lower z-index here). */}
              <div className={styles.menuBackdrop} onClick={() => setShowProfileMenu(false)} />
              <div className={`${styles.flyout} ${styles.flyoutBottom}`}>
                <div className={styles.userName}>{user.displayName}</div>
                <div className={styles.hDivider} />
                <Link
                  to="/profile"
                  className={styles.menuItem}
                  onClick={() => {
                    setShowProfileMenu(false);
                    closeMobileDrawer();
                  }}
                >
                  Profile settings
                </Link>
                {user.isAdmin && (
                  <Link
                    to="/settings"
                    className={styles.menuItem}
                    onClick={() => {
                      setShowProfileMenu(false);
                      closeMobileDrawer();
                    }}
                  >
                    Administrator settings
                  </Link>
                )}
                <button type="button" className={styles.menuItem} onClick={toggleThemeMode}>
                  {mode === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
                </button>
                <a
                  href="https://github.com/trentnbauer/QueueUp/issues/new/choose"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.menuItem}
                  onClick={() => setShowProfileMenu(false)}
                >
                  🐞 Report an issue
                </a>
                <div className={styles.hDivider} />
                <a href={authApi.logoutUrl} className={styles.menuItem}>
                  Sign out
                </a>
              </div>
            </>
          )}
        </div>
      </nav>

      {showAddRoom && <AddRoomModal onClose={() => setShowAddRoom(false)} />}
    </>
  );
}
