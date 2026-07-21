import { useConfirm } from '../context/ConfirmContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import styles from './SteamImportCard.module.css';

interface SteamWishlistImportCardProps {
  steamLinked: boolean;
}

/** Wishlist counterpart to SteamImportCard (issue #228) - same tile treatment, same shared
 * SteamImportContext (so a library import and a wishlist import can't run concurrently and race
 * each other writing to the shelf), just a different action and result copy. Games land on the
 * shelf with status Wishlist rather than the default. */
export function SteamWishlistImportCard({ steamLinked }: SteamWishlistImportCardProps) {
  const confirm = useConfirm();
  const { busy, activeKind, result, error, wishlistProgress, startLink, runWishlistImport } = useSteamImportContext();
  const isMine = activeKind === 'wishlist';
  const myResult = isMine ? result : null;
  const myError = isMine ? error : null;

  async function handleClick() {
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

  return (
    <button type="button" className={styles.card} onClick={handleClick} disabled={busy}>
      <div className={styles.icon} aria-hidden="true">
        💭
      </div>
      <div className={styles.label}>
        {busy && isMine ? 'Importing…' : steamLinked ? 'Import Steam Wishlist' : 'Link Steam Account'}
      </div>
      {!busy && !myResult && !myError && (
        <div className={styles.hint}>
          {steamLinked ? 'Add your Steam wishlist to this shelf' : 'Sign in with Steam to import your wishlist'}
        </div>
      )}
      {busy && isMine && (
        <div className={styles.hint}>
          {wishlistProgress
            ? `${wishlistProgress.totalWishlisted} wishlisted · checked ${wishlistProgress.imported + wishlistProgress.skipped} of ${wishlistProgress.consideredCount} · ${wishlistProgress.imported} imported so far`
            : 'Checking your Steam wishlist…'}
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
