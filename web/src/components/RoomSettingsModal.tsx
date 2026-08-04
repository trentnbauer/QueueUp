import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROOM_PLATFORM_LABELS,
  SPIN_WHEEL_THEME_LABELS,
  type Game,
  type Room,
  type RoomMember,
  type RoomPlatform,
  type RoomRole,
  type SpinWheelTheme,
} from '@queueup/shared';
import { roomsApi } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { ACCENT_PRESETS } from '../theme/defaultTheme';
import { exportGames } from '../utils/exportGames';
import { getBasePath } from '../utils/basePath';
import { formatRelativeTime } from '../utils/relativeTime';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { AvatarBadge } from './AvatarBadge';
import { computeRoomYearInReview } from './roomYearInReview';
import styles from './RoomSettingsModal.module.css';
// Reuses the personal Year in Review's own styles (issue #365) - same visual language for the
// room-scoped counterpart, rather than a second near-identical stylesheet.
import yirStyles from '../views/ProfileSettingsView.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];
const SPIN_WHEEL_THEME_OPTIONS = Object.keys(SPIN_WHEEL_THEME_LABELS) as SpinWheelTheme[];

const ROLE_LABEL: Record<RoomRole, string> = {
  room_master: 'Room Master',
  moderator: 'Moderator',
  member: 'Member',
};

interface RoomSettingsModalProps {
  room: Room;
  members: RoomMember[];
  games: Game[];
  onClose: () => void;
}

export function RoomSettingsModal({ room, members, games, onClose }: RoomSettingsModalProps) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const exportMenuRef = useRef<HTMLDetailsElement>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const [name, setName] = useState(room.name);
  const [platform, setPlatform] = useState<RoomPlatform>(room.platform);
  const [accentColor, setAccentColor] = useState(room.accentColor);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(room.discordWebhookUrl ?? '');
  const [spinOwnershipMaxPrice, setSpinOwnershipMaxPrice] = useState(String(room.spinOwnershipMaxPrice));
  const [spinWheelTheme, setSpinWheelTheme] = useState<SpinWheelTheme>(room.spinWheelTheme);
  const [isPublic, setIsPublic] = useState(room.isPublic);
  const [requireGameApproval, setRequireGameApproval] = useState(room.requireGameApproval);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showYearInReview, setShowYearInReview] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const inviteUrl = room.inviteCode ? `${window.location.origin}${getBasePath()}/join/${room.inviteCode}` : null;
  const isElevated = room.myRole === 'room_master' || room.myRole === 'moderator';

  // Issue #365: built entirely from games already loaded for this room - no fetch, no per-member
  // Steam calls (unlike the personal Year in Review) - see computeRoomYearInReview's own comment.
  const roomYearInReview = useMemo(() => computeRoomYearInReview(games), [games]);

  const candidates = useQuery({
    queryKey: ['room-invite-candidates', room.id],
    queryFn: () => roomsApi.inviteCandidates(room.id),
    enabled: isElevated,
  });
  const candidateUsers = candidates.data?.users ?? [];

  // Issue #509 - fetched lazily behind "Show activity", same collapsed-by-default pattern as Year
  // in Review above: a member opens this to look back, it isn't something the modal needs ready on
  // every open.
  const activity = useInfiniteQuery({
    queryKey: ['room-activity', room.id],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => roomsApi.activity(room.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    enabled: showActivity,
  });
  const activityEntries = activity.data?.pages.flatMap((page) => page.entries) ?? [];

  async function handleCopyInviteCode() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  }

  const isRoomMaster = room.myRole === 'room_master';
  const parsedMaxPrice = Number.parseInt(spinOwnershipMaxPrice, 10);
  const maxPriceValid = spinOwnershipMaxPrice.trim() !== '' && Number.isInteger(parsedMaxPrice) && parsedMaxPrice >= 0;
  const dirty =
    name.trim() !== room.name ||
    platform !== room.platform ||
    accentColor !== room.accentColor ||
    discordWebhookUrl.trim() !== (room.discordWebhookUrl ?? '') ||
    parsedMaxPrice !== room.spinOwnershipMaxPrice ||
    spinWheelTheme !== room.spinWheelTheme ||
    isPublic !== room.isPublic ||
    requireGameApproval !== room.requireGameApproval;

  function invalidateRoomQueries() {
    queryClient.invalidateQueries({ queryKey: ['rooms'] });
    queryClient.invalidateQueries({ queryKey: ['room-members', room.id] });
    queryClient.invalidateQueries({ queryKey: ['room-invite-candidates', room.id] });
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Room name cannot be empty');
      return;
    }
    if (!maxPriceValid) {
      setError('Spin ownership price must be a whole dollar amount, 0 or more');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await roomsApi.update(room.id, {
        name: name.trim(),
        platform,
        accentColor,
        discordWebhookUrl: discordWebhookUrl.trim() || null,
        spinOwnershipMaxPrice: parsedMaxPrice,
        spinWheelTheme,
        isPublic,
        requireGameApproval,
      });
      invalidateRoomQueries();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save room settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetRole(targetUserId: string, displayName: string, role: RoomRole) {
    if (role === 'room_master') {
      const ok = await confirm({
        title: 'Transfer Room Master?',
        message: `${displayName} will become the new Room Master. You'll be moved to Moderator.`,
        confirmLabel: 'Transfer',
        danger: true,
      });
      if (!ok) return;
    }
    setError(null);
    try {
      await roomsApi.setRole(room.id, targetUserId, role);
      invalidateRoomQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that member's role");
    }
  }

  async function handleAddMember() {
    if (!selectedCandidateId) return;
    setAddingMember(true);
    setError(null);
    try {
      await roomsApi.addMember(room.id, selectedCandidateId);
      setSelectedCandidateId('');
      invalidateRoomQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that member');
    } finally {
      setAddingMember(false);
    }
  }

  async function handleDeleteRoom() {
    const ok = await confirm({
      title: 'Delete this room?',
      message: `${room.name} and all its games, votes, and membership will be permanently deleted. This can't be undone.`,
      confirmLabel: 'Delete room',
      danger: true,
      typedConfirmation: 'DELETE',
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      await roomsApi.delete(room.id);
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      onClose();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this room');
      setDeleting(false);
    }
  }

  function handleExport(format: 'csv' | 'json') {
    exportGames(games, format, 'squad-room');
    exportMenuRef.current?.removeAttribute('open');
  }

  async function handleRemove(targetUserId: string, displayName: string) {
    const ok = await confirm({
      title: 'Remove this member?',
      message: `${displayName} will be removed from ${room.name}.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await roomsApi.removeMember(room.id, targetUserId);
      invalidateRoomQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that member');
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Room settings"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>Room Settings</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Details</div>
          {isRoomMaster ? (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="room-settings-name">
                  Room name
                </label>
                <input
                  id="room-settings-name"
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="room-settings-platform">
                  Platform
                </label>
                <select
                  id="room-settings-platform"
                  className={styles.select}
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as RoomPlatform)}
                >
                  {ROOM_PLATFORM_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {ROOM_PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Accent color</span>
                <div className={styles.accentRow}>
                  {ACCENT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={`${styles.accentSwatch} ${accentColor === preset.value ? styles.accentSwatchSelected : ''}`}
                      style={{ background: preset.value }}
                      title={preset.name}
                      aria-label={`Accent: ${preset.name}`}
                      onClick={() => setAccentColor(preset.value)}
                    />
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="room-settings-webhook">
                  Discord webhook URL
                </label>
                <input
                  id="room-settings-webhook"
                  className={styles.input}
                  placeholder="https://discord.com/api/webhooks/…"
                  value={discordWebhookUrl}
                  onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                />
                <p className={styles.readonlyNote}>
                  When set, room activity (games added, votes coming up, etc.) is also posted to this Discord channel.
                </p>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="room-settings-spin-max-price">
                  Spin ownership price limit ($)
                </label>
                <input
                  id="room-settings-spin-max-price"
                  className={styles.input}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={spinOwnershipMaxPrice}
                  onChange={(e) => setSpinOwnershipMaxPrice(e.target.value)}
                />
                <p className={styles.readonlyNote}>
                  Spin the Wheel only draws from games everyone in the room already owns, or games priced at or
                  under this. Set to $0 to only spin games everyone already owns.
                </p>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="room-settings-spin-theme">
                  Spin the Wheel theme
                </label>
                <select
                  id="room-settings-spin-theme"
                  className={styles.select}
                  value={spinWheelTheme}
                  onChange={(e) => setSpinWheelTheme(e.target.value as SpinWheelTheme)}
                >
                  {SPIN_WHEEL_THEME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {SPIN_WHEEL_THEME_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="room-settings-visibility">
                  Visibility
                </label>
                <select
                  id="room-settings-visibility"
                  className={styles.select}
                  value={isPublic ? 'public' : 'invite_only'}
                  onChange={(e) => setIsPublic(e.target.value === 'public')}
                >
                  <option value="invite_only">Invite only</option>
                  <option value="public">Public</option>
                </select>
                <p className={styles.readonlyNote}>
                  Public rooms are listed for any signed-in member to browse and join instantly, without an invite code.
                </p>
              </div>
              <div className={styles.field}>
                <label className={styles.checkboxRow} htmlFor="room-settings-require-approval">
                  <input
                    id="room-settings-require-approval"
                    type="checkbox"
                    checked={requireGameApproval}
                    onChange={(e) => setRequireGameApproval(e.target.checked)}
                  />
                  Require approval for member-suggested games
                </label>
                <p className={styles.readonlyNote}>
                  When on, a regular Member's "Add a Game" nominates it instead of adding it directly - a Room
                  Master or Moderator has to approve or decline it first. Room Masters and Moderators can still
                  add games directly either way.
                </p>
              </div>
              <button type="button" className={styles.saveButton} onClick={handleSave} disabled={saving || !dirty || !maxPriceValid}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            <p className={styles.readonlyNote}>
              {room.name} · {ROOM_PLATFORM_LABELS[room.platform]}
              <br />
              Only the Room Master can change these settings.
            </p>
          )}
        </div>

        {/* Visible to every member (not just the Room Master/moderators) - export is read-only,
            unlike the management controls above and below which stay role-gated. */}
        {games.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Export</div>
            <details className={styles.exportMenu} ref={exportMenuRef}>
              <summary className={styles.exportButton}>Export ▾</summary>
              <div className={styles.exportPanel}>
                <button type="button" className={styles.memberAction} onClick={() => handleExport('csv')}>
                  Export as CSV
                </button>
                <button type="button" className={styles.memberAction} onClick={() => handleExport('json')}>
                  Export as JSON
                </button>
              </div>
            </details>
          </div>
        )}

        {/* Visible to every member, same reasoning as Export above - read-only, room-collective
            counterpart to the personal Year in Review on Profile Settings (issue #365). */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Year in Review</div>
          <p className={yirStyles.hint}>A summary of the last 12 months for {room.name} - what the squad finished, and what it voted up.</p>
          {!showYearInReview ? (
            <button type="button" className={styles.memberAction} onClick={() => setShowYearInReview(true)}>
              Show room's year in games
            </button>
          ) : (
            <div className={yirStyles.yearInReview}>
              <div className={yirStyles.yearInReviewStats}>
                <div className={yirStyles.yearInReviewStat}>
                  <span className={yirStyles.yearInReviewStatValue}>{roomYearInReview.completedGames.length}</span>
                  <span className={yirStyles.yearInReviewStatLabel}>
                    game{roomYearInReview.completedGames.length === 1 ? '' : 's'} finished by the squad
                  </span>
                </div>
              </div>
              {roomYearInReview.genreSpread.length > 0 && (
                <div>
                  <div className={yirStyles.yearInReviewSubtitle}>Genre spread</div>
                  <div className={yirStyles.genreSpread}>
                    {roomYearInReview.genreSpread.map((g) => {
                      const max = roomYearInReview.genreSpread[0].count;
                      return (
                        <div key={g.genre} className={yirStyles.genreBarRow}>
                          <span className={yirStyles.genreBarLabel}>{g.genre}</span>
                          <div className={yirStyles.genreBarTrack}>
                            <div className={yirStyles.genreBarFill} style={{ width: `${(g.count / max) * 100}%` }} />
                          </div>
                          <span className={yirStyles.genreBarCount}>{g.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {roomYearInReview.completedGames.length > 0 && (
                <div>
                  <div className={yirStyles.yearInReviewSubtitle}>Beaten this year</div>
                  <ul className={yirStyles.completedGroupList}>
                    {roomYearInReview.completedGames.map((g) => (
                      <li key={g.id}>{g.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {roomYearInReview.topVoted && (
                <div>
                  <div className={yirStyles.yearInReviewSubtitle}>Top voted by the squad</div>
                  <ol className={yirStyles.yearInReviewList}>
                    <li className={yirStyles.yearInReviewListItem}>
                      <span>{roomYearInReview.topVoted.title}</span>
                      <span className={yirStyles.yearInReviewListScore}>{roomYearInReview.topVoted.voteScore} pts</span>
                    </li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Visible to every member, same reasoning as Export/Year in Review above (issue #509). */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Activity</div>
          {!showActivity ? (
            <button type="button" className={styles.memberAction} onClick={() => setShowActivity(true)}>
              Show room activity
            </button>
          ) : (
            <>
              {activity.isLoading ? (
                <p className={styles.readonlyNote}>Loading…</p>
              ) : activityEntries.length === 0 ? (
                <p className={styles.readonlyNote}>Nothing's happened in this room yet.</p>
              ) : (
                <div className={styles.activityList}>
                  {activityEntries.map((entry) => (
                    <div key={entry.id} className={styles.activityRow}>
                      <span className={styles.activityMessage}>{entry.message}</span>
                      <span className={styles.activityTime}>{formatRelativeTime(entry.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
              {activity.hasNextPage && (
                <div className={styles.loadMoreRow}>
                  <button
                    type="button"
                    className={styles.memberAction}
                    onClick={() => activity.fetchNextPage()}
                    disabled={activity.isFetchingNextPage}
                  >
                    {activity.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {inviteUrl && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Invite link</div>
            <div className={styles.inviteCodeRow}>
              <strong className={styles.inviteCode} title={inviteUrl}>
                {inviteUrl}
              </strong>
              <button type="button" className={styles.memberAction} onClick={handleCopyInviteCode}>
                {inviteCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className={styles.inviteCodeHint}>Anyone with this link can sign in and join {room.name}. Code: {room.inviteCode}</p>
          </div>
        )}

        {isElevated && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Invite existing member</div>
            {candidateUsers.length === 0 ? (
              <p className={styles.readonlyNote}>
                {candidates.isLoading ? 'Loading…' : 'Every QueueUp member is already in this room.'}
              </p>
            ) : (
              <div className={styles.inviteMemberRow}>
                <select
                  className={styles.select}
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  aria-label="Pick a member to invite"
                >
                  <option value="">Pick a member…</option>
                  {candidateUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.memberAction}
                  onClick={handleAddMember}
                  disabled={!selectedCandidateId || addingMember}
                >
                  {addingMember ? 'Inviting…' : 'Invite'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Members ({members.length})</div>
          <div className={styles.memberList}>
            {members.map((m) => {
              const isSelf = m.user.id === user?.id;
              const canSetRole = isRoomMaster && !isSelf;
              const canRemove = isElevated && m.role !== 'room_master' && !isSelf;
              return (
                <div key={m.user.id} className={styles.memberRow}>
                  <AvatarBadge name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={26} />
                  <div className={styles.memberInfo}>
                    <span className={styles.memberName}>
                      {m.user.displayName}
                      {isSelf ? ' (you)' : ''}
                    </span>
                    {!canSetRole && <span className={styles.memberRole}>{ROLE_LABEL[m.role]}</span>}
                  </div>
                  {canSetRole && (
                    <select
                      className={styles.roleSelect}
                      value={m.role}
                      aria-label={`Set ${m.user.displayName}'s role`}
                      onChange={(e) => handleSetRole(m.user.id, m.user.displayName, e.target.value as RoomRole)}
                    >
                      <option value="member">Member</option>
                      <option value="moderator">Moderator</option>
                      <option value="room_master">Room Master</option>
                    </select>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      className={styles.memberAction}
                      onClick={() => handleRemove(m.user.id, m.user.displayName)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {isRoomMaster && (
          <div className={styles.dangerZone}>
            <button type="button" className={styles.deleteRoomButton} onClick={handleDeleteRoom} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete room'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
