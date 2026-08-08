import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { encodeConnectionCode } from '@queueup/shared';
import { apiKeysApi, API_KEYS_QUERY_KEY } from '../api/apiKeys';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { getBasePath } from '../utils/basePath';
import profileStyles from '../views/ProfileSettingsView.module.css';
import modalStyles from './ImportLibraryModal.module.css';
import keyStyles from './ApiKeysSection.module.css';

const PLAYNITE_KEY_LABEL = 'Playnite Import';
// GitHub's stable "latest release" redirect (not a specific tagged/versioned URL) - the .pext
// asset's filename bakes its version number in (e.g. QueueUpExporter_v0.3.1.pext), so linking a
// specific asset directly would go stale the next time a release ships. This always lands on
// whatever's newest.
const EXTENSION_LATEST_RELEASE_URL = 'https://github.com/trentnbauer/QueueUpPlayniteExtension/releases/latest';
const PLAYNITE_DOWNLOAD_URL = 'https://playnite.link/';

// Issue #474: the wizard used to end on a manual "Push your library" instruction step the user had
// to click "Done" through without QueueUp ever confirming the push actually happened. Now it ends
// on Connect - once Playnite calls in with the generated key for the first time, the modal detects
// that itself (see the lastUsedAt poll below) and advances straight to an unnumbered success
// screen, so "Done" only ever appears once linking is actually confirmed, not just assumed.
const STEP_TITLES = ['Install Playnite', 'Install the extension', 'Connect to QueueUp'];
const LAST_STEP = STEP_TITLES.length - 1;

// How often to re-check whether the generated key has been used yet (see ApiKey.lastUsedAt) once
// it's on screen waiting to be pasted into Playnite - frequent enough that the auto-advance to the
// success screen feels immediate, cheap enough (one small /api/me/api-keys fetch) not to matter.
const LINK_POLL_INTERVAL_MS = 3000;

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
  const [keyId, setKeyId] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  // Once a setup code is generated, poll the same api-keys list Profile Settings uses (so this
  // doesn't need its own endpoint) until this specific key's lastUsedAt flips non-null - that's
  // Playnite actually calling in with it for the first time, not just the code existing. Stops
  // polling as soon as that happens or the modal closes.
  const linkStatus = useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: apiKeysApi.list,
    enabled: keyId !== null && !linked,
    refetchInterval: LINK_POLL_INTERVAL_MS,
  });

  useEffect(() => {
    if (!keyId || linked) return;
    const key = linkStatus.data?.keys.find((k) => k.id === keyId);
    if (key?.lastUsedAt) setLinked(true);
  }, [keyId, linked, linkStatus.data]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const created = await apiKeysApi.create(PLAYNITE_KEY_LABEL);
      // Issue #438: appended getBasePath() to the origin so a sub-path-hosted instance's
      // connection code still points at the right mount point. Whether the external Playnite
      // extension (QueueUpPlayniteExtension, a separate C# repo not covered by this app's tests)
      // composes its own request URLs correctly against a path-bearing `url` here is unverified -
      // a known limitation, not a silently-assumed fix.
      setCode(encodeConnectionCode({ url: `${window.location.origin}${getBasePath()}`, key: created.key }));
      setKeyId(created.id);
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
            <span aria-hidden="true">{linked ? '✅' : '🕹️'}</span> {linked ? 'Successfully linked!' : STEP_TITLES[activeStep]}
          </div>
          {/* The success screen isn't a numbered step - it's reached automatically once linking is
              confirmed, not by clicking through a fixed count, so there's nothing here to count
              against. */}
          {!linked && (
            <span className={modalStyles.wizardStepCount}>
              Step {activeStep + 1} of {STEP_TITLES.length}
            </span>
          )}
        </div>

        {linked && (
          <p className={modalStyles.wizardBody}>
            You've linked Playnite to QueueUp. Whenever you want QueueUp to pick up library
            changes, run <code>Extensions → QueueUp → Push library to QueueUp</code> in Playnite
            again - there's no automatic sync yet, so re-run it any time your library changes.
            It's worth downloading metadata for your whole library first (
            <code>Library → Download Metadata</code>) so QueueUp has full details for each game.
          </p>
        )}

        {!linked && activeStep === 0 && (
          <p className={modalStyles.wizardBody}>
            Playnite is a free, open-source game library manager for Windows. It can pull your
            games in from Steam, Epic, GOG, and other stores/emulators - plus your Xbox,
            PlayStation, and Switch libraries - into one local library. QueueUp's extension then
            pushes that combined library here.{' '}
            <a href={PLAYNITE_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              Download and install Playnite
            </a>
            , then in Playnite connect whichever library sources you want reflected in QueueUp
            (Steam, Epic, GOG, Xbox, PlayStation, Switch, etc. - under <code>Add-ons</code> or
            each source's own connect flow). Click Next once it's installed and set up.
          </p>
        )}

        {!linked && activeStep === 1 && (
          <p className={modalStyles.wizardBody}>
            Next, install the QueueUp extension for Playnite -{' '}
            <a href={EXTENSION_LATEST_RELEASE_URL} target="_blank" rel="noreferrer">
              download the latest version
            </a>{' '}
            (the <code>.pext</code> file), then drag and drop it into Playnite's window to
            install it. Once installed, you'll see a new <code>QueueUp</code> menu under
            Playnite's <code>Extensions</code> menu.
          </p>
        )}

        {!linked && activeStep === 2 && (
          <>
            <p className={modalStyles.wizardBody}>
              Generate a setup code below, then in Playnite run{' '}
              <code>Extensions → QueueUp → Connect to QueueUp...</code> and paste it in.
            </p>

            {error && <div className={profileStyles.error}>{error}</div>}

            {code ? (
              <>
                <div className={keyStyles.newKeyBox}>
                  <p className={keyStyles.newKeyWarning}>
                    Copy this now - you won't be able to see it again. It carries the same access
                    as a raw API key, so treat it like a password.
                  </p>
                  <div className={keyStyles.newKeyRow}>
                    <code className={keyStyles.newKeyValue}>{code}</code>
                    <button type="button" className={profileStyles.linkButton} onClick={handleCopy}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                {/* Confirms the paste actually worked instead of leaving the user to guess and
                    click a manual "Done" - see the linkStatus poll above, which is what flips
                    `linked` and swaps this whole screen out automatically. */}
                <p className={modalStyles.wizardWaiting}>
                  <span className={modalStyles.wizardSpinner} aria-hidden="true" />
                  Waiting for Playnite to connect - this'll continue on its own once it does.
                </p>
              </>
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

        <div className={modalStyles.wizardNav}>
          {linked ? (
            <button
              type="button"
              className={`${profileStyles.linkButton} ${modalStyles.wizardNavSolo}`}
              onClick={onClose}
            >
              Finish
            </button>
          ) : (
            <>
              <button
                type="button"
                className={profileStyles.unlinkButton}
                onClick={() => (activeStep === 0 ? onClose() : setActiveStep(activeStep - 1))}
              >
                {activeStep === 0 ? 'Cancel' : 'Back'}
              </button>
              {/* Steps 0/1 advance on a manual Next click; step 2 (Connect) doesn't get one -
                  progressing past it happens automatically via the linkStatus poll above once
                  Playnite actually uses the generated key, not by clicking through it. */}
              {activeStep < LAST_STEP && (
                <button
                  type="button"
                  className={profileStyles.linkButton}
                  onClick={() => setActiveStep(activeStep + 1)}
                >
                  Next
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
