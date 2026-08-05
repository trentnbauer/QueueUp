import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, type RoomPlatform } from '@queueup/shared';
import { useRooms } from '../hooks/useRooms';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { ACCENT_PRESETS } from '../theme/defaultTheme';
import { roomsApi } from '../api/rooms';
import styles from './AddRoomModal.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];
// HTML <select> values are always strings, so null ("any platform", issue #473) needs a string
// stand-in distinct from every real RoomPlatform key.
const ANY_PLATFORM_VALUE = 'any';

type Step = 'options' | 'create' | 'join' | 'browse';

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
  const { rooms, createRoom, joinRoom, joinPublicRoom } = useRooms();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('options');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<RoomPlatform | null>('pc');
  const [isPublic, setIsPublic] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const publicRooms = useQuery({
    queryKey: ['public-rooms'],
    queryFn: () => roomsApi.publicRooms(),
    enabled: step === 'browse',
  });

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const accentColor = pickAccentColor(rooms);
      const { room } = await createRoom.mutateAsync({ name: name.trim(), platform, accentColor, isPublic });
      onClose();
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that room');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinPublicRoom(roomId: string) {
    setJoiningRoomId(roomId);
    setError(null);
    try {
      const { room } = await joinPublicRoom.mutateAsync(roomId);
      onClose();
      navigate(`/room/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that room');
    } finally {
      setJoiningRoomId(null);
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
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
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
            <button type="button" className={styles.optionButton} onClick={() => setStep('browse')}>
              Browse public rooms
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
                value={platform ?? ANY_PLATFORM_VALUE}
                onChange={(e) => setPlatform(e.target.value === ANY_PLATFORM_VALUE ? null : (e.target.value as RoomPlatform))}
              >
                <option value={ANY_PLATFORM_VALUE}>Any platform</option>
                {ROOM_PLATFORM_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {ROOM_PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="add-room-visibility">
                Visibility
              </label>
              <select
                id="add-room-visibility"
                className={styles.select}
                value={isPublic ? 'public' : 'invite_only'}
                onChange={(e) => setIsPublic(e.target.value === 'public')}
              >
                <option value="invite_only">Invite only</option>
                <option value="public">Public</option>
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

        {step === 'browse' && (
          <div className={styles.form}>
            {publicRooms.isLoading && <p className={styles.readonlyNote}>Loading public rooms…</p>}
            {!publicRooms.isLoading && (publicRooms.data?.rooms.length ?? 0) === 0 && (
              <p className={styles.readonlyNote}>No public rooms yet.</p>
            )}
            {!publicRooms.isLoading && (publicRooms.data?.rooms.length ?? 0) > 0 && (
              <div className={styles.publicRoomList}>
                {publicRooms.data!.rooms.map((room) => (
                  <div key={room.id} className={styles.publicRoomRow}>
                    <span className={styles.publicRoomSwatch} style={{ background: room.accentColor }} />
                    <div className={styles.publicRoomInfo}>
                      <span className={styles.publicRoomName}>{room.name}</span>
                      <span className={styles.publicRoomMeta}>
                        {room.platform ? ROOM_PLATFORM_LABELS[room.platform] : 'Any platform'} · {room.memberCount} member
                        {room.memberCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.memberActionButton}
                      onClick={() => handleJoinPublicRoom(room.id)}
                      disabled={joiningRoomId === room.id}
                    >
                      {joiningRoomId === room.id ? 'Joining…' : 'Join'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
