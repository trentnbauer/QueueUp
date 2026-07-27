import { useConfirm } from '../context/ConfirmContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useSteamCompletionsSync } from '../hooks/useSteamCompletionsSync';
import { SteamCompletionsSyncModal } from './SteamCompletionsSyncModal';
import { ActionErrorBanner } from './ActionErrorBanner';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
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
 * about to use them. Lists every importable library as its own section - just Steam for now, laid
 * out so a future second source is another section here rather than another permanent grid tile.
 * Reuses the exact same hooks/mutations the three tiles used (SteamImportContext,
 * useSteamCompletionsSync), so behavior - shared busy state between library/wishlist imports so
 * they can't race each other, confirm-before-import, progress polling - is unchanged, just
 * relocated into one place. */
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
  const { busy, activeKind, result, error, progress, wishlistProgress, startLink, runImport, runWishlistImport } =
    useSteamImportContext();
  const completions = useSteamCompletionsSync();

  const libraryBusy = busy && activeKind === 'library';
  const wishlistBusy = busy && activeKind === 'wishlist';
  const libraryResult = activeKind === 'library' ? result : null;
  const libraryError = activeKind === 'library' ? error : null;
  const wishlistResult = activeKind === 'wishlist' ? result : null;
  const wishlistError = activeKind === 'wishlist' ? error : null;

  async function handleImportLibrary() {
    if (!steamLinked) {
      startLink('library');
      return;
    }
    const ok = await confirm({
      title: 'Import your Steam library?',
      message: 'Pulls your most-played Steam games onto your shelf, skipping anything already here. This can take a little while.',
      confirmLabel: 'Import',
    });
    if (!ok) return;
    await runImport();
  }

  async function handleImportWishlist() {
    if (!steamLinked) {
      startLink('wishlist');
      return;
    }
    const ok = await confirm({
      title: 'Import your Steam wishlist?',
      message: 'Adds games from your Steam wishlist to this shelf as Wishlist, skipping anything already here.',
      confirmLabel: 'Import',
    });
    if (!ok) return;
    await runWishlistImport();
  }

  function handleSyncCompletions() {
    if (!steamLinked) {
      window.location.href = '/auth/steam/link';
      return;
    }
    completions.scan();
  }

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

            <button type="button" className={styles.actionRow} onClick={handleImportLibrary} disabled={busy}>
              <span className={styles.actionLabel}>
                {libraryBusy ? 'Importing…' : steamLinked ? 'Import Library' : 'Link Steam Account'}
              </span>
              <span className={styles.actionHint}>
                {libraryBusy
                  ? progress
                    ? `${progress.totalOwned} owned · checked ${progress.imported + progress.skipped} of ${progress.consideredCount} · ${progress.imported} imported so far`
                    : 'Checking your Steam library…'
                  : (libraryResult ?? libraryError ?? (steamLinked
                      ? 'Add your most-played Steam games to this shelf'
                      : 'Sign in with Steam to import your library'))}
              </span>
            </button>

            <button type="button" className={styles.actionRow} onClick={handleImportWishlist} disabled={busy}>
              <span className={styles.actionLabel}>
                {wishlistBusy ? 'Importing…' : steamLinked ? 'Import Wishlist' : 'Link Steam Account'}
              </span>
              <span className={styles.actionHint}>
                {wishlistBusy
                  ? wishlistProgress
                    ? `${wishlistProgress.totalWishlisted} wishlisted · checked ${wishlistProgress.imported + wishlistProgress.skipped} of ${wishlistProgress.consideredCount} · ${wishlistProgress.imported} imported so far`
                    : 'Checking your Steam wishlist…'
                  : (wishlistResult ?? wishlistError ?? (steamLinked
                      ? 'Add your Steam wishlist to this shelf'
                      : 'Sign in with Steam to import your wishlist'))}
              </span>
            </button>

            <button type="button" className={styles.actionRow} onClick={handleSyncCompletions} disabled={completions.busy}>
              <span className={styles.actionLabel}>
                {completions.busy ? 'Checking Steam…' : steamLinked ? 'Sync Achievement Completions' : 'Link Steam Account'}
              </span>
              <span className={styles.actionHint}>
                {completions.error ??
                  (steamLinked
                    ? "Find shelf games you've 100%'d on Steam but haven't marked Beaten"
                    : 'Sign in with Steam to sync completions')}
              </span>
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
    </>
  );
}
