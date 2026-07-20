import { useEffect, useState } from 'react';
import { PRICE_REGION_LABELS, ROOM_PLATFORM_LABELS, type PriceRegion, type RoomPlatform } from '@queueup/shared';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import styles from './ProfileSettingsView.module.css';

const ROOM_PLATFORM_OPTIONS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];
const PRICE_REGION_OPTIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];

const PROVIDER_LABELS: Record<string, string> = {
  oidc: 'Single sign-on',
  google: 'Google',
  discord: 'Discord',
  steam: 'Steam',
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/** Every provider the server has configured, plus which of them can currently sign into this
 * account. Any Link/Unlink action redirects the full page (OAuth handshakes aren't ajax-able), so
 * this refetches on mount to pick up wherever that redirect left off. */
function useLinkedAccounts() {
  const { primaryProvider, linkedProviders, refetch } = useAuth();
  const [availableProviders, setAvailableProviders] = useState<string[] | null>(null);

  useEffect(() => {
    authApi.providers().then(({ providers }) => setAvailableProviders(providers));
  }, []);

  return { availableProviders, primaryProvider, linkedProviders, refetchLinked: refetch };
}

/** Personal, per-user preferences that aren't tied to any one room or shelf: which systems you
 * own (scopes the Personal Shelf's add-game search), which currency prices display in, and which
 * providers can sign into this account. */
export function ProfileSettingsView() {
  const { user, ownedPlatforms, refetch } = useAuth();
  const { region, setRegion } = useCurrencyRegion();
  const { availableProviders, primaryProvider, linkedProviders, refetchLinked } = useLinkedAccounts();
  const [selected, setSelected] = useState<Set<RoomPlatform>>(new Set(ownedPlatforms));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  if (!user) return null;

  async function handleUnlink(provider: string) {
    setUnlinking(provider);
    setLinkError(null);
    try {
      await authApi.unlink(provider);
      await refetchLinked();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : `Could not unlink ${providerLabel(provider)}`);
    } finally {
      setUnlinking(null);
    }
  }

  const dirty =
    selected.size !== ownedPlatforms.length || ownedPlatforms.some((p) => !selected.has(p));

  function toggle(platform: RoomPlatform) {
    setSaved(false);
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
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your systems owned');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Profile Settings</h1>

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

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Systems owned</div>
        <p className={styles.hint}>
          Tick the systems you own to limit the Personal Shelf's add-game search to games available
          on them. Leave everything unticked to see all platforms.
        </p>
        <div className={styles.checkboxList}>
          {ROOM_PLATFORM_OPTIONS.map((platform) => (
            <label key={platform} className={styles.checkboxRow}>
              <input type="checkbox" checked={selected.has(platform)} onChange={() => toggle(platform)} />
              {ROOM_PLATFORM_LABELS[platform]}
            </label>
          ))}
        </div>
        <div className={styles.saveRow}>
          <button type="button" className={styles.saveButton} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {saved && !dirty && <span className={styles.savedHint}>Saved</span>}
        </div>
      </div>

      {availableProviders && availableProviders.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Linked accounts</div>
          <p className={styles.hint}>
            Link another sign-in method to this account so you can log in with any of them.
          </p>
          {linkError && <div className={styles.error}>{linkError}</div>}
          <div className={styles.linkedAccountsList}>
            {availableProviders.map((provider) => {
              const linked = linkedProviders.includes(provider);
              const isPrimary = provider === primaryProvider;
              return (
                <div key={provider} className={styles.linkedAccountRow}>
                  <span className={styles.linkedAccountName}>{providerLabel(provider)}</span>
                  {isPrimary ? (
                    <span className={styles.linkedAccountStatus}>Primary</span>
                  ) : linked ? (
                    <button
                      type="button"
                      className={styles.unlinkButton}
                      onClick={() => handleUnlink(provider)}
                      disabled={unlinking === provider}
                    >
                      {unlinking === provider ? 'Unlinking…' : 'Unlink'}
                    </button>
                  ) : (
                    <a className={styles.linkButton} href={authApi.linkUrl(provider)}>
                      Link
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
