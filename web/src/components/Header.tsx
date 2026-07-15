import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, type RoomPlatform } from '@squadqueue/shared';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useRooms } from '../hooks/useRooms';
import { roomsApi } from '../api/rooms';
import { authApi } from '../api/auth';
import { AvatarBadge } from './AvatarBadge';
import { ACCENT_PRESETS } from '../theme/defaultTheme';
import styles from './Header.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];

export function Header() {
  const { user } = useAuth();
  const { activeRoom } = useView();
  const { rooms, createRoom, joinRoom } = useRooms();
  const navigate = useNavigate();

  const roomMenuRef = useRef<HTMLDetailsElement>(null);
  const profileMenuRef = useRef<HTMLDetailsElement>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPlatform, setNewRoomPlatform] = useState<RoomPlatform>('pc');
  const [inviteCode, setInviteCode] = useState('');

  const { data: membersData } = useQuery({
    queryKey: ['room-members', activeRoom?.id],
    queryFn: () => roomsApi.members(activeRoom!.id),
    enabled: !!activeRoom,
  });
  const members = membersData?.members ?? [];

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    const accentColor = ACCENT_PRESETS[Math.floor(Math.random() * ACCENT_PRESETS.length)].value;
    const { room } = await createRoom.mutateAsync({ name: newRoomName.trim(), platform: newRoomPlatform, accentColor });
    setNewRoomName('');
    setNewRoomPlatform('pc');
    setShowCreateForm(false);
    roomMenuRef.current?.removeAttribute('open');
    navigate(`/room/${room.id}`);
  }

  async function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    const { room } = await joinRoom.mutateAsync({ inviteCode: inviteCode.trim() });
    setInviteCode('');
    setShowJoinForm(false);
    roomMenuRef.current?.removeAttribute('open');
    navigate(`/room/${room.id}`);
  }

  if (!user) return null;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <div className={styles.brand}>
          <a href="/" className={styles.brandName}>
            SQUAD<span style={{ color: 'var(--sq-accent)' }}>//</span>QUEUE
          </a>
          <div className={styles.tagline}>Games the squad wants to play together</div>
        </div>

        <details className={styles.menu} ref={roomMenuRef}>
          <summary className={styles.menuButton}>{activeRoom ? activeRoom.name : 'Personal Shelf'} ▾</summary>
          <div className={`${styles.menuPanel} ${styles.menuPanelLeft}`}>
            <a href="/" className={`${styles.menuItem} ${!activeRoom ? styles.menuItemActive : ''}`}>
              Personal Shelf
            </a>
            {rooms.length > 0 && <div className={styles.divider} />}
            {rooms.map((room) => (
              <a
                key={room.id}
                href={`/room/${room.id}`}
                className={`${styles.menuItem} ${activeRoom?.id === room.id ? styles.menuItemActive : ''}`}
              >
                {room.name} <span style={{ color: 'var(--sq-muted)', fontWeight: 400 }}>· {ROOM_PLATFORM_LABELS[room.platform]}</span>
              </a>
            ))}
            <div className={styles.divider} />
            {!showCreateForm && !showJoinForm && (
              <>
                <button className={styles.menuItem} onClick={() => setShowCreateForm(true)}>
                  + New room
                </button>
                <button className={styles.menuItem} onClick={() => setShowJoinForm(true)}>
                  Join with invite code
                </button>
              </>
            )}
            {showCreateForm && (
              <form className={styles.miniForm} onSubmit={handleCreateRoom}>
                <input
                  autoFocus
                  placeholder="Room name"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                />
                <select value={newRoomPlatform} onChange={(e) => setNewRoomPlatform(e.target.value as RoomPlatform)}>
                  {ROOM_PLATFORM_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {ROOM_PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>
                <button type="submit">Create room</button>
              </form>
            )}
            {showJoinForm && (
              <form className={styles.miniForm} onSubmit={handleJoinRoom}>
                <input
                  autoFocus
                  placeholder="Invite code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                />
                <button type="submit">Join room</button>
              </form>
            )}
            {activeRoom?.inviteCode && (
              <>
                <div className={styles.divider} />
                <div className={styles.menuItem} style={{ color: 'var(--sq-muted)' }}>
                  Invite code: <strong style={{ color: 'var(--sq-text)' }}>{activeRoom.inviteCode}</strong>
                </div>
              </>
            )}
          </div>
        </details>
      </div>

      <div className={styles.right}>
        {activeRoom && members.length > 0 && (
          <div className={styles.avatarStack}>
            {members.map((m) => (
              <AvatarBadge
                key={m.user.id}
                name={m.user.displayName}
                color={m.user.avatarColor}
                avatarUrl={m.user.avatarUrl}
                size={32}
              />
            ))}
          </div>
        )}

        <details className={styles.menu} ref={profileMenuRef}>
          <summary className={styles.menuButton}>
            <AvatarBadge name={user.displayName} color={user.avatarColor} avatarUrl={user.avatarUrl} size={22} />
            Signed in as {user.displayName} ▾
          </summary>
          <div className={styles.menuPanel}>
            {user.isAdmin && (
              <>
                <a href="/settings" className={styles.menuItem}>
                  Administrator settings
                </a>
                <div className={styles.divider} />
              </>
            )}
            <a href={authApi.logoutUrl} className={styles.menuItem}>
              Sign out
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}
