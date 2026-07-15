import { useState } from 'react';
import { gamesApi } from '../api/games';
import { useConfirm } from '../context/ConfirmContext';
import styles from './SteamImportButton.module.css';

interface SteamImportButtonProps {
  onImported: () => void;
}

export function SteamImportButton({ onImported }: SteamImportButtonProps) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    const ok = await confirm({
      title: 'Import your Steam library?',
      message: `Pulls your most-played Steam games onto your shelf, skipping anything already here. This can take a little while.`,
      confirmLabel: 'Import',
    });
    if (!ok) return;

    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const { imported, skipped, totalOwned, consideredCount } = await gamesApi.importSteamLibrary();
      setResult(
        imported === 0
          ? `No new games to add (checked ${consideredCount} of ${totalOwned} owned).`
          : `Added ${imported} game${imported === 1 ? '' : 's'} (skipped ${skipped} already-owned/unmatched, checked ${consideredCount} of ${totalOwned} owned).`,
      );
      if (imported > 0) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import your Steam library');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.row}>
      <button type="button" className={styles.button} onClick={handleImport} disabled={busy}>
        {busy ? 'Importing…' : 'Import Steam library'}
      </button>
      {result && <span className={styles.result}>{result}</span>}
      {error && <span className={styles.result} style={{ color: '#ff8a80' }}>{error}</span>}
    </div>
  );
}
