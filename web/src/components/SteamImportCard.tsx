import { useEffect, useRef, useState } from 'react';
import { gamesApi } from '../api/games';
import { useConfirm } from '../context/ConfirmContext';
import styles from './SteamImportCard.module.css';

interface SteamImportCardProps {
  steamLinked: boolean;
  onImported: () => void;
}

// Set right before redirecting to Steam sign-in to link an account, and consumed on the way back
// (see the effect below) - the whole point of linking was to import, so once the link succeeds the
// import should run immediately rather than making the user click "Import" a second time after
// already having gone through the Steam sign-in flow once for this same action.
const PENDING_IMPORT_KEY = 'queueup-pending-steam-import';

/** Sits in the grid as its own tile, last in the list, matching the Spin the Wheel tile's pattern
 * of living inside the collection rather than as a toolbar/banner action above it. Always visible,
 * even without a linked Steam account - clicking it while unlinked starts Steam sign-in to link one
 * (rather than hiding the card entirely and leaving non-Steam users with no path to it). */
export function SteamImportCard({ steamLinked, onImported }: SteamImportCardProps) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoImportRan = useRef(false);

  useEffect(() => {
    if (!steamLinked || autoImportRan.current || !sessionStorage.getItem(PENDING_IMPORT_KEY)) return;
    autoImportRan.current = true;
    sessionStorage.removeItem(PENDING_IMPORT_KEY);
    runImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamLinked]);

  async function handleClick() {
    if (!steamLinked) {
      sessionStorage.setItem(PENDING_IMPORT_KEY, '1');
      window.location.href = '/auth/steam/link';
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

  async function runImport() {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const { imported, skipped, totalOwned, consideredCount } = await gamesApi.importSteamLibrary();
      setResult(
        imported === 0
          ? `No new games to add (checked ${consideredCount} of ${totalOwned} owned).`
          : `Added ${imported} game${imported === 1 ? '' : 's'} (skipped ${skipped}, checked ${consideredCount} of ${totalOwned} owned).`,
      );
      if (imported > 0) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import your Steam library');
    } finally {
      setBusy(false);
    }
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
      {result && <div className={styles.hint}>{result}</div>}
      {error && (
        <div className={styles.hint} style={{ color: '#ff8a80' }}>
          {error}
        </div>
      )}
    </button>
  );
}
