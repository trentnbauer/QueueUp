import { useEffect, useState } from 'react';
import { PRICE_REGION_LABELS, ROOM_PLATFORM_LABELS, type PriceRegion, type RoomPlatform } from '@queueup/shared';
import { authApi } from '../api/auth';
import { playniteApi } from '../api/playnite';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
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
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<RoomPlatform>>(new Set(ownedPlatforms));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const [tokenStatus, setTokenStatus] = useState<{ hasToken: boolean; createdAt: string | null; lastUsedAt: string | null } | null>(
    null,
  );
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [playniteBusy, setPlayniteBusy] = useState(false);
  const [playniteError, setPlayniteError] = useState<string | null>(null);

  useEffect(() => {
    playniteApi
      .getTokenStatus()
      .then(setTokenStatus)
      .catch((err) => setPlayniteError(err instanceof Error ? err.message : 'Could not load Playnite token status'));
  }, []);

  async function handleGenerateToken() {
    if (tokenStatus?.hasToken) {
      const ok = await confirm({
        title: 'Replace the existing token?',
        message: 'The Playnite extension will stop working until you paste the new token into its settings.',
        confirmLabel: 'Replace',
      });
      if (!ok) return;
    }
    setPlayniteBusy(true);
    setPlayniteError(null);
    try {
      const { token } = await playniteApi.generateToken();
      setRevealedToken(token);
      setCopied(false);
      setTokenStatus(await playniteApi.getTokenStatus());
    } catch (err) {
      setPlayniteError(err instanceof Error ? err.message : 'Could not generate a token');
    } finally {
      setPlayniteBusy(false);
    }
  }

  async function handleRevokeToken() {
    const ok = await confirm({
      title: 'Revoke the Playnite token?',
      message: 'The Playnite extension will no longer be able to sync your library until you generate a new token.',
      confirmLabel: 'Revoke',
    });
    if (!ok) return;
    setPlayniteBusy(true);
    setPlayniteError(null);
    try {
      await playniteApi.revokeToken();
      setRevealedToken(null);
      setTokenStatus(await playniteApi.getTokenStatus());
    } catch (err) {
      setPlayniteError(err instanceof Error ? err.message : 'Could not revoke the token');
    } finally {
      setPlayniteBusy(false);
    }
  }

  async function handleCopyToken() {
    if (!revealedToken) return;
    await navigator.clipboard.writeText(revealedToken);
    setCopied(true);
  }

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

        <div className={styles.divider} />

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Playnite import</div>
          <p className={styles.hint}>
            Install the QueueUp Playnite extension, paste a token below into its settings, and every sync from
            Playnite adds your library here.
          </p>
          {playniteError && <div className={styles.error}>{playniteError}</div>}
          {revealedToken && (
            <div className={styles.tokenReveal}>
              <code className={styles.tokenValue}>{revealedToken}</code>
              <button type="button" className={styles.copyButton} onClick={handleCopyToken}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <p className={styles.tokenWarning}>This won't be shown again — copy it now.</p>
            </div>
          )}
          {tokenStatus && !revealedToken && (
            <p className={styles.hint}>
              {tokenStatus.hasToken
                ? `Token active · created ${new Date(tokenStatus.createdAt!).toLocaleDateString()} · last synced ${
                    tokenStatus.lastUsedAt ? new Date(tokenStatus.lastUsedAt).toLocaleString() : 'never'
                  }`
                : 'No token yet.'}
            </p>
          )}
          <div className={styles.tokenActions}>
            <button type="button" className={styles.saveButton} onClick={handleGenerateToken} disabled={playniteBusy}>
              {tokenStatus?.hasToken ? 'Regenerate token' : 'Generate token'}
            </button>
            {tokenStatus?.hasToken && (
              <button type="button" className={styles.revokeButton} onClick={handleRevokeToken} disabled={playniteBusy}>
                Revoke
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
