import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IGDB_PLATFORM_NAMES, type GameStatus, type RoomRole } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { useView } from '../context/ViewContext';
import { useConfirm } from '../context/ConfirmContext';
import { useGames } from '../hooks/useGames';
import { useGameFilter } from '../context/GameFilterContext';
import { ALL_FILTER_VALUE, distinctValues } from './gameGridLogic';
import { roomsApi } from '../api/rooms';
import { AvatarBadge } from './AvatarBadge';
import { RoomSettingsModal } from './RoomSettingsModal';
import { AddGameModal } from './AddGameModal';
import styles from './Header.module.css';

const ROLE_LABEL: Record<RoomRole, string> = {
  room_master: 'Room Master',
  moderator: 'Moderator',
  member: 'Member',
};

// Fixed display order for the status filter pills (issue #182) - not alphabetical, reads in the
// same rough lifecycle order as the status menu itself.
const STATUS_FILTER_ORDER: GameStatus[] = ['wishlist', 'backlog', 'playing', 'done', 'dropped'];

interface PillFilterProps {
  label: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Single-select filter rendered as a row of toggleable pills (matching the app's existing
 * pill-badge look) instead of a bare <select> - reads as part of the header rather than a form. */
function PillFilter({ label, allLabel, options, value, onChange }: PillFilterProps) {
  if (options.length < 2) return null;
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterLabel}>{label}</span>
      <div className={styles.filterPills}>
        <button
          type="button"
          className={`${styles.filterPill} ${value === ALL_FILTER_VALUE ? styles.filterPillActive : ''}`}
          onClick={() => onChange(ALL_FILTER_VALUE)}
        >
          {allLabel}
        </button>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.filterPill} ${value === option ? styles.filterPillActive : ''}`}
            onClick={() => onChange(value === option ? ALL_FILTER_VALUE : option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Header() {
  const { user, ownedPlatforms } = useAuth();
  const { activeRoom } = useView();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const {
    platformFilter,
    genreFilter,
    statusFilter,
    searchQuery,
    setPlatformFilter,
    setGenreFilter,
    setStatusFilter,
    setSearchQuery,
  } = useGameFilter();

  const membersMenuRef = useRef<HTMLDetailsElement>(null);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showAddGame, setShowAddGame] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const membersQueryKey = ['room-members', activeRoom?.id];
  const { data: membersData } = useQuery({
    queryKey: membersQueryKey,
    queryFn: () => roomsApi.members(activeRoom!.id),
    enabled: !!activeRoom,
  });
  const members = membersData?.members ?? [];
  const myRole = activeRoom?.myRole;

  // Reuses the same ['games', 'room'|'shelf', ...] query as the active view (RoomView/ShelfView) -
  // React Query dedupes by queryKey, so this doesn't trigger an extra network fetch.
  const { games, invalidate: invalidateGames } = useGames(activeRoom?.id ?? null);

  // A Room already has one fixed platform, so every game in it matches - the platform filter is
  // only meaningful on the Personal Shelf, where games can span multiple systems. There, once the
  // user has ticked which systems they own, only show filter pills for those - a filter option for
  // a system they don't own (surfaced by e.g. a cross-platform title's IGDB platform list) isn't a
  // useful choice.
  const ownedPlatformLabels = useMemo(
    () => (ownedPlatforms.length > 0 ? new Set(ownedPlatforms.flatMap((p) => IGDB_PLATFORM_NAMES[p])) : null),
    [ownedPlatforms],
  );
  const platformOptions = useMemo(() => {
    if (activeRoom) return [];
    const all = distinctValues(games, (g) => g.platform);
    return ownedPlatformLabels ? all.filter((label) => ownedPlatformLabels.has(label)) : all;
  }, [games, activeRoom, ownedPlatformLabels]);
  const genreOptions = useMemo(() => distinctValues(games, (g) => g.genre), [games]);
  const statusOptions = useMemo(() => {
    const present = new Set(games.map((g) => g.status));
    return STATUS_FILTER_ORDER.filter((status) => present.has(status));
  }, [games]);

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
    await roomsApi.setRole(activeRoom.id, targetUserId, 'moderator');
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

  async function handleCopyInviteCode() {
    if (!activeRoom?.inviteCode) return;
    await navigator.clipboard.writeText(`${window.location.origin}/join/${activeRoom.inviteCode}`);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  }

  if (!user) return null;

  return (
    <header className={styles.header}>
      <div className={styles.topRow}>
        <div className={styles.left}>
          <div className={styles.title}>{activeRoom ? activeRoom.name : 'Personal Shelf'}</div>

          {activeRoom?.inviteCode && (
            <button
              type="button"
              className={styles.inviteBadge}
              onClick={handleCopyInviteCode}
              title="Click to copy a shareable invite link"
              aria-label="Copy room invite link"
            >
              {inviteCopied ? 'Copied!' : `Invite: ${activeRoom.inviteCode}`}
            </button>
          )}

          {activeRoom && (
            <button
              type="button"
              className={styles.settingsButton}
              onClick={() => setShowRoomSettings(true)}
              title="Room info & settings"
              aria-label="Room info & settings"
            >
              ⚙
            </button>
          )}
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
        </div>
      </div>

      <div className={styles.actionsRow}>
        <button type="button" className={styles.addGameButton} onClick={() => setShowAddGame(true)}>
          + Add Game
        </button>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search games…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search games by title"
        />
        <PillFilter
          label="Platform"
          allLabel="All platforms"
          options={platformOptions}
          value={platformFilter}
          onChange={setPlatformFilter}
        />
        <PillFilter
          label="Genre"
          allLabel="All genres"
          options={genreOptions}
          value={genreFilter}
          onChange={setGenreFilter}
        />
        <PillFilter
          label="Status"
          allLabel="All statuses"
          options={statusOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {showRoomSettings && activeRoom && (
        <RoomSettingsModal
          room={activeRoom}
          members={members}
          games={games}
          onClose={() => setShowRoomSettings(false)}
        />
      )}

      {showAddGame && (
        <AddGameModal
          roomId={activeRoom?.id ?? null}
          onAdded={invalidateGames}
          onClose={() => setShowAddGame(false)}
        />
      )}
    </header>
  );
}
