import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROOM_PLATFORM_LABELS } from '@squadqueue/shared';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useRooms } from '../hooks/useRooms';
import { authApi } from '../api/auth';
import { AvatarBadge } from './AvatarBadge';
import { ProfileSettingsModal } from './ProfileSettingsModal';
import { AddRoomModal } from './AddRoomModal';
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
  const { rooms } = useRooms();

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);

  if (!user) return null;

  return (
    <nav className={styles.sidebar} aria-label="Rooms">
      <div className={styles.brand} title="SquadQueue">
        SQ
      </div>
      <div className={styles.divider} />

      <div className={styles.icons}>
        <Link
          to="/"
          className={`${styles.roomIcon} ${!activeRoom ? styles.roomIconActive : ''}`}
          title="Personal Shelf"
        >
          🗂
        </Link>

        {rooms.map((room) => (
          <Link
            key={room.id}
            to={`/room/${room.id}`}
            className={`${styles.roomIcon} ${activeRoom?.id === room.id ? styles.roomIconActive : ''}`}
            style={{ background: room.accentColor, color: contrastTextColor(room.accentColor) }}
            title={`${room.name} · ${ROOM_PLATFORM_LABELS[room.platform]}`}
          >
            {initials(room.name)}
          </Link>
        ))}
      </div>

      <button
        type="button"
        className={styles.addRoomIcon}
        title="Create or join a room"
        aria-label="Create or join a room"
        onClick={() => setShowAddRoom(true)}
      >
        +
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
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setShowProfileMenu(false);
                  setShowProfileSettings(true);
                }}
              >
                Profile settings
              </button>
              {user.isAdmin && (
                <Link to="/settings" className={styles.menuItem} onClick={() => setShowProfileMenu(false)}>
                  Administrator settings
                </Link>
              )}
              <div className={styles.hDivider} />
              <a href={authApi.logoutUrl} className={styles.menuItem}>
                Sign out
              </a>
            </div>
          </>
        )}
      </div>

      {showAddRoom && <AddRoomModal onClose={() => setShowAddRoom(false)} />}
      {showProfileSettings && <ProfileSettingsModal onClose={() => setShowProfileSettings(false)} />}
    </nav>
  );
}
