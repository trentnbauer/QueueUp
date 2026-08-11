import { useState } from 'react';
import { Link, useLocation } from 'react-router';
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

const ICON_PROPS = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 } as const;

function ShelfIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="7" height="16" />
      <rect x="14" y="4" width="7" height="16" />
    </svg>
  );
}

function AchievementsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5v2a3 3 0 003 3M16 6h3v2a3 3 0 01-3 3M9 20h6M12 13v7" />
    </svg>
  );
}

function InsightsIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 19V9M10 19V5M16 19v-6M22 19H2" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 11l2 2 4-4" />
      <path d="M12 3a3 3 0 013 3h2a2 2 0 012 2v11a2 2 0 01-2 2H7a2 2 0 01-2-2V8a2 2 0 012-2h2a3 3 0 013-3z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5" />
    </svg>
  );
}

/** Left-panel nav (industrial/minimal redesign) - a labeled 230px panel instead of the old
 * Discord-style circular icon rail: text nav items up top, a Rooms list below, account controls
 * anchored to the bottom. Same underlying links/actions as before, just laid out per the new
 * design system. */
export function Sidebar() {
  const { user } = useAuth();
  const { activeRoom } = useView();
  // /playing (issue #364) isn't tracked in ViewContext (it's not a shelf/room, just an aggregate
  // view over them), so its icon's active state is checked directly against the URL instead.
  const onPlayingPage = useLocation().pathname === '/playing';
  const onBeatenPage = useLocation().pathname === '/beaten';
  const onReviewPage = useLocation().pathname === '/review';
  const onAchievementsPage = useLocation().pathname === '/achievements';
  const onInsightsPage = useLocation().pathname === '/insights';
  const { rooms } = useRooms();
  const { totalUnread, unreadRoomIds } = useNotificationSummary();
  // Badge on the Needs Review item (see NeedsReviewView) - the review queue used to live silently
  // inside Profile Settings with nothing anywhere else hinting it needed attention.
  const pendingReviewCount = usePendingImportsCount();
  const markAllNotificationsRead = useMarkAllNotificationsRead();
  const { mode, toggle: toggleThemeMode } = useThemeMode();
  // Issue #359: a Steam library/wishlist import can run for minutes in the background (see
  // useSteamImport) with nothing visible once the person's navigated away from the button that
  // started it - this surfaces it as a spinner on the same brand mark every screen already has,
  // rather than only being visible from the Personal Shelf header.
  const steamImport = useSteamImportContext();

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  // Below the 640px breakpoint the panel becomes an off-canvas drawer (hidden by default, toggled
  // by a fixed hamburger button) instead of just shrinking - a permanent, always-visible 230px
  // panel claims too much width on a phone screen for navigation that's used rarely relative to
  // the game grid content. No effect above that breakpoint (CSS keeps the panel docked and this
  // state unused).
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

  const shelfActive = (!activeRoom || onPlayingPage || onBeatenPage) && !onReviewPage && !onAchievementsPage && !onInsightsPage;

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
            // Must contain the button's own visible text ("QueueUp", see the wordmark span below) -
            // WCAG 2.5.3 Label in Name, so voice-control ("click QueueUp") and screen readers agree
            // with what's on screen instead of only ever announcing "Notifications".
            aria-label={totalUnread > 0 ? `QueueUp — notifications (${totalUnread} unread)` : 'QueueUp — notifications'}
            onClick={() => (showNotifications ? closeNotifications() : setShowNotifications(true))}
          >
            <span className={styles.logoMark}>
              <Logo size={16} />
              {steamImport.busy && <span className={styles.importSpinner} aria-hidden="true" />}
              {totalUnread > 0 && <span className={styles.unreadDot} aria-hidden="true" />}
            </span>
            <span className={styles.wordmark}>QueueUp</span>
          </button>
          {showNotifications && (
            <>
              {/* Full-screen click-catcher to close the flyout on any outside click, without a
                  library - sits behind the flyout itself (lower in the DOM = lower z-index here). */}
              <div className={styles.menuBackdrop} onClick={closeNotifications} />
              <NotificationFlyout onNavigate={closeMobileDrawer} steamImport={steamImport} />
            </>
          )}
        </div>

        <div className={styles.navList}>
          {/* Personal Shelf, plus the cross-room Currently Playing (issue #364) and Beaten (issue
              #481) dashboards - originally three separate links here, merged into one destination
              (issue #490) with ShelfTabs switching between them, since all three are really just
              different views of "your games." */}
          <Link to="/" className={`${styles.navItem} ${shelfActive ? styles.navItemActive : ''}`} onClick={closeMobileDrawer}>
            <ShelfIcon />
            Shelf
          </Link>

          {/* QueueUp's own gamification panel (issue #489) - a dedicated item rather than folding
              into ShelfTabs alongside Shelf/Playing/Beaten (issue #490), since this is a distinct
              hub of its own (milestones across everything you do here) rather than another view of
              "your games" specifically. */}
          <Link
            to="/achievements"
            className={`${styles.navItem} ${onAchievementsPage ? styles.navItemActive : ''}`}
            onClick={closeMobileDrawer}
          >
            <AchievementsIcon />
            Achievements
          </Link>

          {/* Backlog Insights (issue #512) - a personal on-demand dashboard, same reasoning for a
              dedicated item as Achievements above. */}
          <Link
            to="/insights"
            className={`${styles.navItem} ${onInsightsPage ? styles.navItemActive : ''}`}
            onClick={closeMobileDrawer}
          >
            <InsightsIcon />
            Insights
          </Link>

          {/* Needs Review queue (unmatched import titles) - used to live silently inside Profile
              Settings; a top-level item with a badge (matching the notification-dot pattern above)
              makes it visible from anywhere instead of only to someone who thinks to check settings.
              Hidden entirely when there's nothing to review - unlike Insights (always useful as a
              glance, empty or not), an empty review queue is the common case and permanent nav
              space for it would just be noise most users never act on. */}
          {pendingReviewCount > 0 && (
            <Link to="/review" className={`${styles.navItem} ${onReviewPage ? styles.navItemActive : ''}`} onClick={closeMobileDrawer}>
              <ReviewIcon />
              Needs Review
              <span className={styles.navBadge}>{pendingReviewCount}</span>
            </Link>
          )}
        </div>

        <div className={styles.roomsHeader}>
          <span className={styles.roomsLabel}>Rooms</span>
          <button
            type="button"
            className={styles.addRoomButton}
            title="Create or join a room"
            aria-label="Create or join a room"
            onClick={() => {
              closeMobileDrawer();
              setShowAddRoom(true);
            }}
          >
            <PlusIcon />
          </button>
        </div>

        <div className={styles.roomsList}>
          {rooms.map((room) => {
            const active = activeRoom?.id === room.id && !onPlayingPage && !onBeatenPage && !onAchievementsPage && !onInsightsPage;
            return (
              <Link
                key={room.id}
                to={`/room/${room.id}`}
                className={`${styles.roomRow} ${active ? styles.roomRowActive : ''}`}
                title={`${room.name} · ${room.platform ? ROOM_PLATFORM_LABELS[room.platform] : 'Any platform'}`}
                onClick={closeMobileDrawer}
              >
                <span className={styles.roomChip} style={{ background: room.accentColor, color: contrastTextColor(room.accentColor) }}>
                  {initials(room.name)}
                </span>
                <span className={styles.roomName}>{room.name}</span>
                {unreadRoomIds.has(room.id) && <span className={styles.roomUnreadDot} aria-hidden="true" />}
              </Link>
            );
          })}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.userPanel}
            aria-label={`Signed in as ${user.displayName}`}
            onClick={() => setShowProfileMenu((v) => !v)}
          >
            <AvatarBadge name={user.displayName} color={user.avatarColor} avatarUrl={user.avatarUrl} size={26} />
            <span className={styles.userName}>{user.displayName}</span>
          </button>
          <button
            type="button"
            className={styles.themeToggle}
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
            onClick={toggleThemeMode}
          >
            <ThemeIcon />
          </button>
          {showProfileMenu && (
            <>
              <div className={styles.menuBackdrop} onClick={() => setShowProfileMenu(false)} />
              <div className={`${styles.flyout} ${styles.flyoutBottom}`}>
                <div className={styles.flyoutUserName}>{user.displayName}</div>
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
