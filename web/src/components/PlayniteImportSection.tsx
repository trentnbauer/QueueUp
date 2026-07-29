import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { encodeConnectionCode } from '@queueup/shared';
import { apiKeysApi, API_KEYS_QUERY_KEY } from '../api/apiKeys';
import profileStyles from '../views/ProfileSettingsView.module.css';
import styles from './ApiKeysSection.module.css';

const PLAYNITE_KEY_LABEL = 'Playnite Import';

/** Profile Settings' "Playnite Import" section (issue #441) - the Playnite extension itself isn't
 * built yet (see #396's research), but it'll need a QueueUp server URL and a personal API key to
 * push a library into. Rather than making a user copy those two values separately, this generates
 * a normal API key (same underlying create call as ApiKeysSection, just its own fixed label so
 * it's identifiable in the API keys list below) and packs it with this instance's own URL
 * (`window.location.origin` - QueueUp is self-hosted, so there's no single fixed address to
 * assume) into one paste-able connection code via packages/shared's connectionCode.ts. Decoding
 * only ever needs to happen in that not-yet-built extension - nothing in this app reads one back. */
export function PlayniteImportSection() {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const created = await apiKeysApi.create(PLAYNITE_KEY_LABEL);
      setCode(encodeConnectionCode({ url: window.location.origin, key: created.key }));
      setCopied(false);
      // So the new key shows up in the API Keys section above right away, not just after a
      // manual reload (issue #441) - same shared cache key ApiKeysSection's own create/revoke
      // mutations invalidate.
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a Playnite setup code');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  return (
    <div className={profileStyles.section}>
      <div className={profileStyles.sectionTitle}>Playnite import</div>
      <p className={profileStyles.hint}>
        Generates a setup code to paste into the QueueUp Playnite extension - it packs this
        server's address and a new personal API key together, so you only have to copy one value
        instead of entering a URL and a key separately.
      </p>
      {error && <div className={profileStyles.error}>{error}</div>}

      {code ? (
        <div className={styles.newKeyBox}>
          <p className={styles.newKeyWarning}>
            Copy this now - you won't be able to see it again. It carries the same access as a raw
            API key, so treat it like a password.
          </p>
          <div className={styles.newKeyRow}>
            <code className={styles.newKeyValue}>{code}</code>
            <button type="button" className={profileStyles.linkButton} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" className={profileStyles.unlinkButton} onClick={() => setCode(null)}>
            Done
          </button>
        </div>
      ) : (
        <div className={profileStyles.saveRow}>
          <button type="button" className={profileStyles.linkButton} onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate Playnite setup code'}
          </button>
        </div>
      )}
    </div>
  );
}
