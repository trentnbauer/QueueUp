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
 * Uses the shared SteamImportContext (not its own useSteamImport instance) so this tile and the
 * Header's re-sync button can't independently think "nothing's running" and both fire an import. */
export function SteamImportCard({ steamLinked }: SteamImportCardProps) {
  const confirm = useConfirm();
  const { busy, result, error, progress, startLink, runImport } = useSteamImportContext();

  async function handleClick() {
    if (!steamLinked) {
      startLink();
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
        {busy ? 'Importing…' : steamLinked ? 'Import Steam Library' : 'Link Steam Account'}
      </div>
      {!busy && !result && !error && (
        <div className={styles.hint}>
          {steamLinked ? 'Add your most-played Steam games to this shelf' : 'Sign in with Steam to import your library'}
        </div>
      )}
      {busy && (
        <div className={styles.hint}>
          {progress
            ? `${progress.totalOwned} owned · checked ${progress.imported + progress.skipped} of ${progress.consideredCount} · ${progress.imported} imported so far`
            : 'Checking your Steam library…'}
        </div>
      )}
      {result && <div className={styles.hint}>{result}</div>}
      {error && (
        <div className={styles.hint} style={{ color: '#ff8a80' }}>
          {error}
        </div>
      )}
    </button>
  );
}
