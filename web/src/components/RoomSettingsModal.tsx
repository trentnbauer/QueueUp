import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ROOM_PLATFORM_LABELS,
  type Game,
  type Room,
  type RoomMember,
  type RoomPlatform,
  type RoomRole,
} from '@squadqueue/shared';
import { roomsApi } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { ACCENT_PRESETS } from '../theme/defaultTheme';
import { exportGames } from '../utils/exportGames';
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
  const queryClient = useQueryClient();
  const exportMenuRef = useRef<HTMLDetailsElement>(null);

  const [name, setName] = useState(room.name);
  const [platform, setPlatform] = useState<RoomPlatform>(room.platform);
  const [accentColor, setAccentColor] = useState(room.accentColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const inviteUrl = room.inviteCode ? `${window.location.origin}/join/${room.inviteCode}` : null;

  async function handleCopyInviteCode() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  }

  const isRoomMaster = room.myRole === 'room_master';
  const isElevated = room.myRole === 'room_master' || room.myRole === 'moderator';
  const dirty = name.trim() !== room.name || platform !== room.platform || accentColor !== room.accentColor;

  function invalidateRoomQueries() {
    queryClient.invalidateQueries({ queryKey: ['rooms'] });
    queryClient.invalidateQueries({ queryKey: ['room-members', room.id] });
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Room name cannot be empty');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await roomsApi.update(room.id, { name: name.trim(), platform, accentColor });
      invalidateRoomQueries();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save room settings');
    } finally {
      setSaving(false);
    }
  }

  async function handlePromote(targetUserId: string) {
    setError(null);
    try {
      await roomsApi.promote(room.id, targetUserId);
      invalidateRoomQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not promote that member');
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
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Room settings"
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

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Members ({members.length})</div>
          <div className={styles.memberList}>
            {members.map((m) => {
              const isSelf = m.user.id === user?.id;
              const canPromote = isRoomMaster && m.role === 'member';
              const canRemove = isElevated && m.role !== 'room_master' && !isSelf;
              return (
                <div key={m.user.id} className={styles.memberRow}>
                  <AvatarBadge name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={26} />
                  <div className={styles.memberInfo}>
                    <span className={styles.memberName}>
                      {m.user.displayName}
                      {isSelf ? ' (you)' : ''}
                    </span>
                    <span className={styles.memberRole}>{ROLE_LABEL[m.role]}</span>
                  </div>
                  {canPromote && (
                    <button type="button" className={styles.memberAction} onClick={() => handlePromote(m.user.id)}>
                      Promote
                    </button>
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
      </div>
    </div>
  );
}
