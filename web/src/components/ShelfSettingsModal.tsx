import { useState } from 'react';
import { ROOM_PLATFORM_LABELS, type RoomPlatform } from '@squadqueue/shared';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import styles from './ShelfSettingsModal.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];

interface ShelfSettingsModalProps {
  onClose: () => void;
}

/** Lets the user tick which systems they own, so the Personal Shelf's add-game search/create flow
 * can be scoped to just those (the same way a Room's platform scopes it there). Ticking nothing
 * keeps the current "show everything" behavior. */
export function ShelfSettingsModal({ onClose }: ShelfSettingsModalProps) {
  const { ownedPlatforms, refetch } = useAuth();
  const [selected, setSelected] = useState<Set<RoomPlatform>>(new Set(ownedPlatforms));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    selected.size !== ownedPlatforms.length || ownedPlatforms.some((p) => !selected.has(p));

  function toggle(platform: RoomPlatform) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await authApi.updateOwnedPlatforms(Array.from(selected));
      await refetch();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your systems owned');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Systems owned"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>Systems Owned</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <p className={styles.hint}>
          Tick the systems you own to limit the Personal Shelf's add-game search to games available
          on them. Leave everything unticked to see all platforms.
        </p>

        <div className={styles.checkboxList}>
          {ROOM_PLATFORM_OPTIONS.map((platform) => (
            <label key={platform} className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={selected.has(platform)}
                onChange={() => toggle(platform)}
              />
              {ROOM_PLATFORM_LABELS[platform]}
            </label>
          ))}
        </div>

        <button type="button" className={styles.saveButton} onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
