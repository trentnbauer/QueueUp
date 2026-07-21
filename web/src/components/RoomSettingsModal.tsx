import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROOM_PLATFORM_LABELS,
  type Game,
  type Room,
  type RoomMember,
  type RoomPlatform,
  type RoomRole,
} from '@queueup/shared';
import { roomsApi } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { ACCENT_PRESETS } from '../theme/defaultTheme';
import { exportGames } from '../utils/exportGames';
import { useModalA11y } from '../hooks/useModalA11y';
import { AvatarBadge } from './AvatarBadge';
import styles from './RoomSettingsModal.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];

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
  const [spinOnlyFullyOwned, setSpinOnlyFullyOwned] = useState(room.spinOnlyFullyOwned);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const inviteUrl = room.inviteCode ? `${window.location.origin}/join/${room.inviteCode}` : null;
  const isElevated = room.myRole === 'room_master' || room.myRole === 'moderator';

  const candidates = useQuery({
    queryKey: ['room-invite-candidates', room.id],
    queryFn: () => roomsApi.inviteCandidates(room.id),
    enabled: isElevated,
  });
  const candidateUsers = candidates.data?.users ?? [];

  async function handleCopyInviteCode() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  }

  const isRoomMaster = room.myRole === 'room_master';
  const dirty =
    name.trim() !== room.name ||
    platform !== room.platform ||
    accentColor !== room.accentColor ||
    discordWebhookUrl.trim() !== (room.discordWebhookUrl ?? '') ||
    spinOnlyFullyOwned !== room.spinOnlyFullyOwned;

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
    setSaving(true);
    setError(null);
    try {
      await roomsApi.update(room.id, {
        name: name.trim(),
        platform,
        accentColor,
        discordWebhookUrl: discordWebhookUrl.trim() || null,
        spinOnlyFullyOwned,
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
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
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
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={spinOnlyFullyOwned}
                  onChange={(e) => setSpinOnlyFullyOwned(e.target.checked)}
                />
                Only spin games everyone in the room already owns
              </label>
              <button type="button" className={styles.saveButton} onClick={handleSave} disabled={saving || !dirty}>
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
