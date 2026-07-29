import { useEffect, useState } from 'react';
import type { ApiKeySummary } from '@queueup/shared';
import { apiKeysApi } from '../api/apiKeys';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './ApiKeysSection.module.css';
import profileStyles from '../views/ProfileSettingsView.module.css';

/** Profile Settings' "API Keys" section (issue #435) - generate/list/revoke a personal access
 * token for /api/v1 (pull your library, push a game in from an external script/Playnite
 * extension/etc.). A key is scoped to this user only, not to any one room - it authenticates as
 * this user, so it can reach any room they're already a member of, the same access they'd have in
 * the app itself. */
export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [creating, setCreating] = useState(false);
  // Shown exactly once, right after creation - never refetchable, same "you won't see this again"
  // principle as a session secret. Cleared on unmount/navigation away, not persisted anywhere.
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function refetch() {
    apiKeysApi
      .list()
      .then(({ keys }) => setKeys(keys))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your API keys'));
  }

  useEffect(refetch, []);

  async function handleCreate() {
    const label = labelDraft.trim();
    if (!label) return;
    setCreating(true);
    setError(null);
    try {
      const created = await apiKeysApi.create(label);
      setJustCreatedKey(created.key);
      setLabelDraft('');
      setCopied(false);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that API key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    setError(null);
    try {
      await apiKeysApi.revoke(id);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke that API key');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopy() {
    if (!justCreatedKey) return;
    await navigator.clipboard.writeText(justCreatedKey);
    setCopied(true);
  }

  const activeKeys = (keys ?? []).filter((k) => !k.revokedAt);
  const revokedKeys = (keys ?? []).filter((k) => k.revokedAt);

  return (
    <div className={profileStyles.section}>
      <div className={profileStyles.sectionTitle}>API keys</div>
      <p className={profileStyles.hint}>
        Pull your library into another system, or push a game in from one (a script, a Playnite
        extension, a home dashboard) - authenticated as you, so a key reaches any room you're
        already a member of. See <code>/api/v1</code> for the read/write API a key unlocks.
      </p>
      {error && <div className={profileStyles.error}>{error}</div>}

      {justCreatedKey && (
        <div className={styles.newKeyBox}>
          <p className={styles.newKeyWarning}>
            Copy this now - you won't be able to see it again. Anyone with this key can read and add
            to your library, so treat it like a password.
          </p>
          <div className={styles.newKeyRow}>
            <code className={styles.newKeyValue}>{justCreatedKey}</code>
            <button type="button" className={profileStyles.linkButton} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" className={profileStyles.unlinkButton} onClick={() => setJustCreatedKey(null)}>
            Done
          </button>
        </div>
      )}

      <div className={styles.createRow}>
        <input
          type="text"
          className={styles.labelInput}
          placeholder="What's this key for? (e.g. Playnite sync)"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          maxLength={100}
        />
        <button type="button" className={profileStyles.linkButton} onClick={handleCreate} disabled={creating || !labelDraft.trim()}>
          {creating ? 'Generating…' : 'Generate key'}
        </button>
      </div>

      {activeKeys.length > 0 && (
        <div className={profileStyles.linkedAccountsList}>
          {activeKeys.map((key) => (
            <div key={key.id} className={profileStyles.linkedAccountRow}>
              <div>
                <div className={profileStyles.linkedAccountName}>{key.label}</div>
                <div className={styles.keyMeta}>
                  Created {formatRelativeTime(key.createdAt)}
                  {' · '}
                  {key.lastUsedAt ? `Last used ${formatRelativeTime(key.lastUsedAt)}` : 'Never used'}
                </div>
              </div>
              <button
                type="button"
                className={profileStyles.unlinkButton}
                onClick={() => handleRevoke(key.id)}
                disabled={revokingId === key.id}
              >
                {revokingId === key.id ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          ))}
        </div>
      )}
      {keys !== null && activeKeys.length === 0 && revokedKeys.length === 0 && (
        <p className={styles.keyMeta}>No API keys yet.</p>
      )}
    </div>
  );
}
