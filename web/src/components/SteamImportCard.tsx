import { useConfirm } from '../context/ConfirmContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import styles from './SteamImportCard.module.css';

interface SteamImportCardProps {
  steamLinked: boolean;
}

/** Sits in the grid as its own tile, last in the list, matching the Spin the Wheel tile's pattern
 * of living inside the collection rather than as a toolbar/banner action above it. Always visible,
 * even without a linked Steam account - clicking it while unlinked starts Steam sign-in to link one
 * (rather than hiding the card entirely and leaving non-Steam users with no path to it).
 *
 * Uses the shared SteamImportContext (not its own useSteamImport instance) so this tile, its
 * SteamWishlistImportCard sibling, and the Header's re-sync button can't independently think
 * "nothing's running" and both fire an import. `activeKind` (rather than the shared result/error
 * alone) is what keeps this tile from showing the wishlist import's result text or vice versa. */
export function SteamImportCard({ steamLinked }: SteamImportCardProps) {
  const confirm = useConfirm();
  const { busy, activeKind, result, error, progress, startLink, runImport } = useSteamImportContext();
  const isMine = activeKind === 'library';
  const myResult = isMine ? result : null;
  const myError = isMine ? error : null;

  async function handleClick() {
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

  return (
    <button type="button" className={styles.card} onClick={handleClick} disabled={busy}>
      <div className={styles.icon} aria-hidden="true">
        🎮
      </div>
      <div className={styles.label}>
        {busy && isMine ? 'Importing…' : steamLinked ? 'Import Steam Library' : 'Link Steam Account'}
      </div>
      {!busy && !myResult && !myError && (
        <div className={styles.hint}>
          {steamLinked ? 'Add your most-played Steam games to this shelf' : 'Sign in with Steam to import your library'}
        </div>
      )}
      {busy && isMine && (
        <div className={styles.hint}>
          {progress
            ? `${progress.totalOwned} owned · checked ${progress.imported + progress.skipped} of ${progress.consideredCount} · ${progress.imported} imported so far`
            : 'Checking your Steam library…'}
        </div>
      )}
      {myResult && <div className={styles.hint}>{myResult}</div>}
      {myError && (
        <div className={styles.hint} style={{ color: '#ff8a80' }}>
          {myError}
        </div>
      )}
    </button>
  );
}
