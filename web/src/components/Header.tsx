import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PRICE_REGION_LABELS, ROOM_PLATFORM_LABELS, type PriceRegion, type RoomPlatform, type RoomRole } from '@squadqueue/shared';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useConfirm } from '../context/ConfirmContext';
import { useRooms } from '../hooks/useRooms';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import { roomsApi } from '../api/rooms';
import { authApi } from '../api/auth';
import { AvatarBadge } from './AvatarBadge';
import { ACCENT_PRESETS } from '../theme/defaultTheme';
import styles from './Header.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];
const PRICE_REGION_OPTIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];

const ROLE_LABEL: Record<RoomRole, string> = {
  room_master: 'Room Master',
  moderator: 'Moderator',
  member: 'Member',
};

export function Header() {
  const { user } = useAuth();
  const { activeRoom } = useView();
  const { rooms, createRoom, joinRoom } = useRooms();
  const { region, setRegion } = useCurrencyRegion();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const roomMenuRef = useRef<HTMLDetailsElement>(null);
  const membersMenuRef = useRef<HTMLDetailsElement>(null);
  const profileMenuRef = useRef<HTMLDetailsElement>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPlatform, setNewRoomPlatform] = useState<RoomPlatform>('pc');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);

  async function handleCopyInviteCode() {
    if (!activeRoom?.inviteCode) return;
    await navigator.clipboard.writeText(activeRoom.inviteCode);
    setInviteCodeCopied(true);
    setTimeout(() => setInviteCodeCopied(false), 1500);
  }

  const membersQueryKey = ['room-members', activeRoom?.id];
  const { data: membersData } = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => roomsApi.members(activeRoom!.id),
    enabled: !!activeRoom,
  });
  const members = membersData?.members ?? [];
  const myRole = activeRoom?.myRole;

  function canPromote(memberRole: RoomRole): boolean {
    return myRole === 'room_master' && memberRole === 'member';
  }

  function canRemove(memberUserId: string, memberRole: RoomRole): boolean {
    if (memberRole === 'room_master') return false; // never removable, including by themselves
    if (memberUserId === user?.id) return true; // leave
    return myRole === 'room_master' || myRole === 'moderator';
  }

  async function handlePromote(targetUserId: string) {
    if (!activeRoom) return;
    await roomsApi.promote(activeRoom.id, targetUserId);
    queryClient.invalidateQueries({ queryKey: membersQueryKey });
  }

  async function handleRemove(targetUserId: string, isSelf: boolean) {
    if (!activeRoom) return;
    const ok = await confirm({
      message: isSelf ? 'Leave this room?' : 'Remove this member from the room?',
      confirmLabel: isSelf ? 'Leave' : 'Remove',
      danger: true,
    });
    if (!ok) return;
    await roomsApi.removeMember(activeRoom.id, targetUserId);
    queryClient.invalidateQueries({ queryKey: membersQueryKey });
    if (isSelf) {
      membersMenuRef.current?.removeAttribute('open');
      navigate('/');
    }
  }

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
            SquadQueue
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
                <div className={styles.inviteCodeRow}>
                  <span style={{ color: 'var(--sq-muted)' }}>
                    Invite code: <strong style={{ color: 'var(--sq-text)' }}>{activeRoom.inviteCode}</strong>
                  </span>
                  <button type="button" className={styles.copyButton} onClick={handleCopyInviteCode}>
                    {inviteCodeCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </>
            )}
          </div>
        </details>
      </div>

      <div className={styles.right}>
        {activeRoom && members.length > 0 && (
          <details className={styles.menu} ref={membersMenuRef}>
            <summary className={styles.avatarStackButton}>
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
            </summary>
            <div className={styles.menuPanel}>
              {members.map((m) => {
                const isSelf = m.user.id === user.id;
                return (
                  <div key={m.user.id} className={styles.memberRow}>
                    <AvatarBadge name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={22} />
                    <div className={styles.memberInfo}>
                      <span className={styles.memberName}>
                        {m.user.displayName}
                        {isSelf ? ' (you)' : ''}
                      </span>
                      <span className={styles.memberRole}>{ROLE_LABEL[m.role]}</span>
                    </div>
                    {canPromote(m.role) && (
                      <button className={styles.memberAction} onClick={() => handlePromote(m.user.id)}>
                        Promote
                      </button>
                    )}
                    {canRemove(m.user.id, m.role) && (
                      <button className={styles.memberAction} onClick={() => handleRemove(m.user.id, isSelf)}>
                        {isSelf ? 'Leave' : 'Remove'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        <details className={styles.menu} ref={profileMenuRef}>
          <summary className={styles.menuButton}>
            <AvatarBadge name={user.displayName} color={user.avatarColor} avatarUrl={user.avatarUrl} size={22} />
            Signed in as {user.displayName} ▾
          </summary>
          <div className={styles.menuPanel}>
            <div className={styles.menuItem} style={{ color: 'var(--sq-muted)', fontSize: 11 }}>
              Price currency
            </div>
            <select
              className={styles.currencySelect}
              value={region ?? ''}
              onChange={(e) => setRegion((e.target.value || undefined) as PriceRegion | undefined)}
            >
              <option value="">Server default</option>
              {PRICE_REGION_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {PRICE_REGION_LABELS[r]}
                </option>
              ))}
            </select>
            <div className={styles.divider} />
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
