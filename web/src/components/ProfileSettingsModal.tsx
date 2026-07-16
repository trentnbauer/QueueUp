import { useState } from 'react';
import { PRICE_REGION_LABELS, ROOM_PLATFORM_LABELS, type PriceRegion, type RoomPlatform } from '@squadqueue/shared';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import { useModalA11y } from '../hooks/useModalA11y';
import styles from './ProfileSettingsModal.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];
const PRICE_REGION_OPTIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];

interface ProfileSettingsModalProps {
  onClose: () => void;
}

/** Personal, per-user preferences that aren't tied to any one room or shelf: which systems you
 * own (scopes the Personal Shelf's add-game search) and which currency prices display in. */
export function ProfileSettingsModal({ onClose }: ProfileSettingsModalProps) {
  const { ownedPlatforms, refetch } = useAuth();
  const { region, setRegion } = useCurrencyRegion();
  const [selected, setSelected] = useState<Set<RoomPlatform>>(new Set(ownedPlatforms));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

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
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Profile settings"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>Profile Settings</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Price currency</div>
          <p className={styles.hint}>Which currency prices should display in, across your shelf and rooms.</p>
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
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Systems owned</div>
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
    </div>
  );
}
