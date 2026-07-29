import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi, API_KEYS_QUERY_KEY } from '../api/apiKeys';
import { formatRelativeTime } from '../utils/relativeTime';
import styles from './ApiKeysSection.module.css';
import profileStyles from '../views/ProfileSettingsView.module.css';

/** Profile Settings' "API Keys" section (issue #435) - generate/list/revoke a personal access
 * token for /api/v1 (pull your library, push a game in from an external script/Playnite
 * extension/etc.). A key is scoped to this user only, not to any one room - it authenticates as
 * this user, so it can reach any room they're already a member of, the same access they'd have in
 * the app itself.
 *
 * The list is a shared React Query cache (API_KEYS_QUERY_KEY), not locally-fetched state - issue
 * #441's Playnite Import section creates a key of its own via the same underlying endpoint, and
 * needs this list to pick that up without a manual page reload, the same way any other
 * mutation-then-invalidate flow in this app works (see useGames.ts). */
export function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [labelDraft, setLabelDraft] = useState('');
  // Shown exactly once, right after creation - never refetchable, same "you won't see this again"
  // principle as a session secret. Cleared on unmount/navigation away, not persisted anywhere.
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, error: loadError } = useQuery({ queryKey: API_KEYS_QUERY_KEY, queryFn: apiKeysApi.list });
  const keys = data?.keys ?? null;

  const create = useMutation({
    mutationFn: apiKeysApi.create,
    onSuccess: (created) => {
      setJustCreatedKey(created.key);
      setLabelDraft('');
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
  });

  const revoke = useMutation({
    mutationFn: apiKeysApi.revoke,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY }),
  });

  function handleCreate() {
    const label = labelDraft.trim();
    if (!label) return;
    create.mutate(label);
  }

  async function handleCopy() {
    if (!justCreatedKey) return;
    await navigator.clipboard.writeText(justCreatedKey);
    setCopied(true);
  }

  const error = create.error ?? revoke.error ?? loadError;
  const errorMessage = error instanceof Error ? error.message : error ? 'Something went wrong with your API keys' : null;
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
      {errorMessage && <div className={profileStyles.error}>{errorMessage}</div>}

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
        <button type="button" className={profileStyles.linkButton} onClick={handleCreate} disabled={create.isPending || !labelDraft.trim()}>
          {create.isPending ? 'Generating…' : 'Generate key'}
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
                onClick={() => revoke.mutate(key.id)}
                disabled={revoke.isPending && revoke.variables === key.id}
              >
                {revoke.isPending && revoke.variables === key.id ? 'Revoking…' : 'Revoke'}
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
