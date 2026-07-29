import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { encodeConnectionCode } from '@queueup/shared';
import { apiKeysApi, API_KEYS_QUERY_KEY } from '../api/apiKeys';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import profileStyles from '../views/ProfileSettingsView.module.css';
import modalStyles from './ImportLibraryModal.module.css';
import keyStyles from './ApiKeysSection.module.css';

const PLAYNITE_KEY_LABEL = 'Playnite Import';
const EXTENSION_REPO_URL = 'https://github.com/trentnbauer/QueueUpPlayniteExtension';
const PLAYNITE_DOWNLOAD_URL = 'https://playnite.link/';

const STEP_TITLES = ['Install Playnite', 'Install the extension', 'Connect to QueueUp', 'Push your library'];
const LAST_STEP = STEP_TITLES.length - 1;

interface PlayniteImportModalProps {
  onClose: () => void;
}

/** Import Library modal's "Playnite" entry opens this as its own dialog (issue #469 follow-up) -
 * an earlier version ran the wizard inline inside the Import Library modal, but stacked below the
 * still-visible Steam section that made the whole thing feel cluttered rather than a focused setup
 * flow. A separate modal (own backdrop/header/close button, same useModalA11y wiring as every
 * other dialog in the app) keeps Playnite's install/connect/push steps on their own screen.
 * Unlike Steam, QueueUp can't detect or drive anything on the Playnite side (it's a separate
 * desktop app the extension polls this server from, not the other way around), so the
 * install/connect/push steps have to be spelled out as instructions rather than one button this
 * app can drive end to end. */
export function PlayniteImportModal({ onClose }: PlayniteImportModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState(0);
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
    <div className={modalStyles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={modalStyles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Import from Playnite"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={modalStyles.header}>
          <span className={modalStyles.title}>Import from Playnite</span>
          <button type="button" className={modalStyles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={modalStyles.wizardHeader}>
          <div className={modalStyles.libraryHeader}>
            <span aria-hidden="true">🕹️</span> {STEP_TITLES[activeStep]}
          </div>
          <span className={modalStyles.wizardStepCount}>
            Step {activeStep + 1} of {STEP_TITLES.length}
          </span>
        </div>

        {activeStep === 0 && (
          <p className={modalStyles.wizardBody}>
            Playnite is a free, open-source game library manager for Windows. It can pull your
            games in from Steam, Epic, GOG, and other stores/emulators into one local library -
            QueueUp's extension then pushes that combined library here.{' '}
            <a href={PLAYNITE_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              Download and install Playnite
            </a>
            , then in Playnite connect whichever library sources you want reflected in QueueUp
            (Steam, Epic, GOG, etc. - under <code>Add-ons</code> or each source's own connect
            flow). Click Next once it's installed and set up.
          </p>
        )}

        {activeStep === 1 && (
          <p className={modalStyles.wizardBody}>
            Next, install the QueueUp extension for Playnite -{' '}
            <a href={EXTENSION_REPO_URL} target="_blank" rel="noreferrer">
              get it from GitHub
            </a>{' '}
            and follow its README. Once installed, you'll see a new <code>QueueUp</code> menu
            under Playnite's <code>Extensions</code> menu.
          </p>
        )}

        {activeStep === 2 && (
          <>
            <p className={modalStyles.wizardBody}>
              Generate a setup code below, then in Playnite run{' '}
              <code>Extensions → QueueUp → Connect to QueueUp...</code> and paste it in.
            </p>

            {error && <div className={profileStyles.error}>{error}</div>}

            {code ? (
              <div className={keyStyles.newKeyBox}>
                <p className={keyStyles.newKeyWarning}>
                  Copy this now - you won't be able to see it again. It carries the same access as
                  a raw API key, so treat it like a password.
                </p>
                <div className={keyStyles.newKeyRow}>
                  <code className={keyStyles.newKeyValue}>{code}</code>
                  <button type="button" className={profileStyles.linkButton} onClick={handleCopy}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
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
                  Creates a personal API key + this server's address, packed into one code to
                  paste into Playnite
                </span>
              </button>
            )}
          </>
        )}

        {activeStep === 3 && (
          <p className={modalStyles.wizardBody}>
            Back in Playnite, run <code>Extensions → QueueUp → Push library to QueueUp</code> to
            send your library over. It's worth downloading metadata for your whole library first (
            <code>Library → Download Metadata</code>) so QueueUp has full details for each game -
            otherwise re-run the push any time you want it to pick up changes, there's no
            automatic sync yet.
          </p>
        )}

        <div className={modalStyles.wizardNav}>
          <button
            type="button"
            className={profileStyles.unlinkButton}
            onClick={() => (activeStep === 0 ? onClose() : setActiveStep(activeStep - 1))}
          >
            {activeStep === 0 ? 'Cancel' : 'Back'}
          </button>
          {activeStep < LAST_STEP ? (
            <button
              type="button"
              className={profileStyles.linkButton}
              onClick={() => setActiveStep(activeStep + 1)}
            >
              Next
            </button>
          ) : (
            <button type="button" className={profileStyles.linkButton} onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
