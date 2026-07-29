import { useState } from 'react';
import { useConfirm } from '../context/ConfirmContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { SteamCompletionsSyncModal } from './SteamCompletionsSyncModal';
import { ActionErrorBanner } from './ActionErrorBanner';
import { PlayniteImportModal } from './PlayniteImportModal';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import profileStyles from '../views/ProfileSettingsView.module.css';
import styles from './ImportLibraryModal.module.css';

interface ImportLibraryModalProps {
  steamLinked: boolean;
  onApplyCompletions: (gameIds: string[]) => Promise<unknown>;
  applyingCompletions: boolean;
  /** Surfaced here (issue #360's identical fix, same reason) rather than relying on the page
   * behind the modal to show it - "Mark Beaten" from the completions review uses Header's own
   * useGames instance, which the page's own ActionErrorBanner (a separate instance) can't see. */
  actionError: string | null;
  onDismissActionError: () => void;
  onClose: () => void;
}

/** Issue #359: consolidates what used to be three permanent tiles at the end of the Personal
 * Shelf grid (SteamImportCard, SteamWishlistImportCard, SteamCompletionsSyncCard) into a single
 * on-demand modal, opened from the header's "Import Library" button - reclaims that grid space for
 * actual games instead of permanent action tiles that were always there whether or not anyone was
 * about to use them. Lists every importable library as its own section - Steam, and (since) a
 * short blurb + button that opens the Playnite setup flow (moved here from Profile Settings after
 * a user went looking for it under this exact button and found only Steam) as its own modal
 * (PlayniteImportModal, issue #469) rather than inline, so its multi-step wizard isn't stacked
 * underneath the still-visible Steam section.
 * Reuses the exact same hooks/mutations the three tiles used (SteamImportContext,
 * useSteamCompletionsSync), so behavior - shared busy state between library/wishlist imports so
 * they can't race each other, confirm-before-import, progress polling - is unchanged, just
 * relocated into one place.
 *
 * Issue #440: the Steam section itself used to still show four rows here (Sync Everything, plus
 * the three granular Import Library/Import Wishlist/Sync Achievement Completions actions it
 * already made redundant) - now just the one "Steam Import" action, since Sync Everything already
 * covered the same ground (library + wishlist + achievements, skipping anything already present)
 * and nobody asked to run just one leg on its own. The granular runImport/runWishlistImport/
 * completions.scan calls this used to expose as separate buttons are still here under the hood -
 * runSyncEverything below still calls them in sequence, and the once-per-session auto-login sync
 * (see SteamImportContext) still calls runImport/runWishlistImport directly - only the UI that let
 * a user trigger them individually is gone. */
export function ImportLibraryModal({
  steamLinked,
  onApplyCompletions,
  applyingCompletions,
  actionError,
  onDismissActionError,
  onClose,
}: ImportLibraryModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const confirm = useConfirm();
  const [showPlaynite, setShowPlaynite] = useState(false);
  const { busy, activeKind, progress, wishlistProgress, startLink, runSyncEverything, syncingEverything, completions } =
    useSteamImportContext();

  const libraryBusy = busy && activeKind === 'library';
  const wishlistBusy = busy && activeKind === 'wishlist';

  // Issue #359/#440: chains library import, wishlist import, and an achievements scan into one
  // confirm/click - the achievements step ends in `completions.result`, reviewed via the
  // SteamCompletionsSyncModal render at the bottom.
  async function handleSteamImport() {
    if (!steamLinked) {
      startLink('library');
      return;
    }
    const ok = await confirm({
      title: 'Import from Steam?',
      message:
        'Imports your library and wishlist, then scans for newly-completed achievements. Skips anything already here - this can take a little while.',
      confirmLabel: 'Import',
    });
    if (!ok) return;
    await runSyncEverything();
  }

  // Issue #440: this used to be three separate buttons, each with its own hint text for its own
  // phase - now it's one button covering all three phases in sequence, so the hint has to say
  // which phase is currently running instead of just "importing…", or the multi-minute operation
  // would look frozen with no feedback for most of its length.
  const importHint = libraryBusy
    ? progress
      ? `Library: ${progress.totalOwned} owned · checked ${progress.imported + progress.skipped} of ${progress.consideredCount} · ${progress.imported} imported so far`
      : 'Checking your Steam library…'
    : wishlistBusy
      ? wishlistProgress
        ? `Wishlist: ${wishlistProgress.totalWishlisted} wishlisted · checked ${wishlistProgress.imported + wishlistProgress.skipped} of ${wishlistProgress.consideredCount} · ${wishlistProgress.imported} imported so far`
        : 'Checking your Steam wishlist…'
      : completions.busy
        ? 'Checking Steam for newly-completed achievements…'
        : steamLinked
          ? 'Imports your library and wishlist, then checks for newly-completed achievements - skips anything already here'
          : 'Sign in with Steam to import your library, wishlist, and achievement completions';

  return (
    <>
      <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
        <div
          ref={dialogRef}
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-label="Import Library"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.header}>
            <span className={styles.title}>Import Library</span>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <ActionErrorBanner message={actionError} onDismiss={onDismissActionError} />

          <div className={styles.librarySection}>
            <div className={styles.libraryHeader}>
              <span aria-hidden="true">🎮</span> Steam
            </div>

            <button
              type="button"
              className={`${styles.actionRow} ${styles.syncEverythingRow}`}
              onClick={handleSteamImport}
              // Also disabled while the once-per-session auto-login sync (see SteamImportContext)
              // is running in the background - without checking syncingEverything here too, a
              // click during that window would silently no-op (runSyncEverything's own reentrancy
              // guard would just return) with no feedback as to why.
              disabled={busy || completions.busy || syncingEverything}
            >
              <span className={styles.syncEverythingLabel}>
                {syncingEverything ? 'Importing…' : steamLinked ? '🔄 Steam Import' : 'Link Steam Account'}
              </span>
              <span className={styles.syncEverythingHint}>{importHint}</span>
            </button>
          </div>

          <div className={`${styles.librarySection} ${styles.secondarySection}`}>
            <p className={styles.playniteBlurb}>
              Track your library with <strong>Playnite</strong> instead? It's a free desktop app
              that pulls games in from Steam, Epic, GOG, and more into one library - import from
              it too.
            </p>
            <button
              type="button"
              className={profileStyles.unlinkButton}
              onClick={() => setShowPlaynite(true)}
            >
              🕹️ Import from other clients (Playnite)
            </button>
          </div>
        </div>
      </div>

      {completions.result && (
        <SteamCompletionsSyncModal
          result={completions.result}
          applying={applyingCompletions}
          onApply={onApplyCompletions}
          onClose={completions.reset}
        />
      )}

      {showPlaynite && <PlayniteImportModal onClose={() => setShowPlaynite(false)} />}
    </>
  );
}
