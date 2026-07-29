import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { encodeConnectionCode } from '@queueup/shared';
import { apiKeysApi, API_KEYS_QUERY_KEY } from '../api/apiKeys';
import profileStyles from '../views/ProfileSettingsView.module.css';
import modalStyles from './ImportLibraryModal.module.css';
import keyStyles from './ApiKeysSection.module.css';

const PLAYNITE_KEY_LABEL = 'Playnite Import';
const EXTENSION_REPO_URL = 'https://github.com/trentnbauer/QueueUpPlayniteExtension';

/** Import Library modal's "Playnite" section - a user reported that clicking "Import Library" only
 * ever showed Steam, because the Playnite setup code generator lived only in Profile Settings
 * (added by #441), a page nobody thinks to check when they're looking for "import my library."
 * Moves that generator here (removed from ProfileSettingsView) and wraps it in the step-by-step
 * guide the Steam section didn't need but Playnite does: unlike Steam, QueueUp can't detect or
 * drive anything on the Playnite side (it's a separate desktop app the extension polls this server
 * from, not the other way around), so the install/connect/push steps have to be spelled out as
 * instructions rather than one button this app can drive end to end. Matches ImportLibraryModal's
 * own doc comment: "future second source is another section here rather than another permanent
 * grid tile." */
export function PlayniteImportGuide() {
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
      // So the new key shows up in Profile Settings' API Keys list right away, not just after a
      // manual reload (same reasoning as #441's original placement).
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
    <div className={`${modalStyles.librarySection} ${modalStyles.secondarySection}`}>
      <div className={modalStyles.libraryHeader}>
        <span aria-hidden="true">🕹️</span> Playnite
      </div>

      <ol className={modalStyles.stepList}>
        <li>
          Don't have the extension installed yet?{' '}
          <a href={EXTENSION_REPO_URL} target="_blank" rel="noreferrer">
            Get it from GitHub
          </a>{' '}
          and follow its README - it adds a <code>QueueUp</code> menu under Playnite's{' '}
          <code>Extensions</code> menu.
        </li>
        <li>
          Generate a setup code below, then in Playnite run{' '}
          <code>Extensions → QueueUp → Connect to QueueUp...</code> and paste it in.
        </li>
        <li>
          Back in Playnite, run <code>Extensions → QueueUp → Push library to QueueUp</code> to send
          your library over. Re-run it any time you want to push changes - there's no automatic sync
          yet.
        </li>
      </ol>

      {error && <div className={profileStyles.error}>{error}</div>}

      {code ? (
        <div className={keyStyles.newKeyBox}>
          <p className={keyStyles.newKeyWarning}>
            Copy this now - you won't be able to see it again. It carries the same access as a raw
            API key, so treat it like a password.
          </p>
          <div className={keyStyles.newKeyRow}>
            <code className={keyStyles.newKeyValue}>{code}</code>
            <button type="button" className={profileStyles.linkButton} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" className={profileStyles.unlinkButton} onClick={() => setCode(null)}>
            Done
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={modalStyles.actionRow}
          onClick={handleGenerate}
          disabled={generating}
        >
          <span className={modalStyles.syncEverythingLabel}>
            {generating ? 'Generating…' : '🔑 Generate setup code'}
          </span>
          <span className={modalStyles.syncEverythingHint}>
            Creates a personal API key + this server's address, packed into one code to paste into
            Playnite
          </span>
        </button>
      )}
    </div>
  );
}
