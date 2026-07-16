import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROOM_PLATFORM_LABELS, type RoomPlatform } from '@squadqueue/shared';
import { useRooms } from '../hooks/useRooms';
import { useModalA11y } from '../hooks/useModalA11y';
import { ACCENT_PRESETS } from '../theme/defaultTheme';
import styles from './AddRoomModal.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];

type Step = 'options' | 'create' | 'join';

interface AddRoomModalProps {
  onClose: () => void;
}

/** Prefers a preset none of the user's current rooms are already using, so rooms read as visually
 * distinct at a glance in the sidebar - only falls back to a plain random pick once every preset
 * is already in use. */
function pickAccentColor(existingRooms: { accentColor: string }[]): string {
  const used = new Set(existingRooms.map((r) => r.accentColor));
  const available = ACCENT_PRESETS.filter((p) => !used.has(p.value));
  const pool = available.length > 0 ? available : ACCENT_PRESETS;
  return pool[Math.floor(Math.random() * pool.length)].value;
}

/** Centered modal (matching Room Settings / Profile Settings) for creating or joining a room -
 * replaces the old corner-anchored flyout off the sidebar's "+" icon. */
export function AddRoomModal({ onClose }: AddRoomModalProps) {
  const { rooms, createRoom, joinRoom } = useRooms();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('options');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<RoomPlatform>('pc');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const accentColor = pickAccentColor(rooms);
      const { room } = await createRoom.mutateAsync({ name: name.trim(), platform, accentColor });
      onClose();
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that room');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inviteCode.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      // Accept either a bare code or a pasted full invite link (e.g. https://.../join/ABC123).
      const pastedLinkMatch = trimmed.match(/\/join\/([^/?#]+)/);
      const code = pastedLinkMatch ? decodeURIComponent(pastedLinkMatch[1]) : trimmed;
      const { room } = await joinRoom.mutateAsync({ inviteCode: code });
      onClose();
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join with that invite code');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Add a room"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>Add a Room</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {step === 'options' && (
          <div className={styles.optionList}>
            <button type="button" className={styles.optionButton} onClick={() => setStep('create')}>
              Create a new room
            </button>
            <button type="button" className={styles.optionButton} onClick={() => setStep('join')}>
              Join with invite code
            </button>
          </div>
        )}

        {step === 'create' && (
          <form className={styles.form} onSubmit={handleCreateRoom}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="add-room-name">
                Room name
              </label>
              <input
                id="add-room-name"
                className={styles.input}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="add-room-platform">
                Platform
              </label>
              <select
                id="add-room-platform"
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
            <button type="submit" className={styles.primaryButton} disabled={submitting || !name.trim()}>
              {submitting ? 'Creating…' : 'Create room'}
            </button>
          </form>
        )}

        {step === 'join' && (
          <form className={styles.form} onSubmit={handleJoinRoom}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="add-room-invite-code">
                Invite code or link
              </label>
              <input
                id="add-room-invite-code"
                className={styles.input}
                autoFocus
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.primaryButton} disabled={submitting || !inviteCode.trim()}>
              {submitting ? 'Joining…' : 'Join room'}
            </button>
          </form>
        )}

        <div className={styles.cancelZone}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
