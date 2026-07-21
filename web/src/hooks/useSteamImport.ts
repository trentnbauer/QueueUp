import { useEffect, useRef, useState } from 'react';
import type { SteamImportProgress, SteamWishlistImportProgress } from '@queueup/shared';
import { gamesApi } from '../api/games';

const PROGRESS_POLL_INTERVAL_MS = 1000;

type ImportKind = 'library' | 'wishlist';

// Set right before redirecting to Steam sign-in to link an account, and consumed on the way back
// (see the effect below) - the whole point of linking was to import, so once the link succeeds the
// import should run immediately rather than making the user click "Import" a second time after
// already having gone through the Steam sign-in flow once for this same action. Stores which kind
// of import was requested (issue #228 added a second kind, wishlist) so the right one resumes.
const PENDING_IMPORT_KEY = 'queueup-pending-steam-import';

/** Shared Steam-import flow (start link, run library or wishlist import, poll progress) behind one
 * hook so it can be triggered from more than one place in the UI (the shelf grid's import tiles,
 * and the header's re-sync button - issue #203) without duplicating the polling/state logic.
 * `busy` is shared across both kinds on purpose - only one Steam import should run at a time, since
 * both write to the same shelf - but `activeKind` lets each caller show its own result/error rather
 * than, say, the wishlist tile displaying "Added 3 games" text that was actually about the library
 * import. */
export function useSteamImport(steamLinked: boolean, onImported: () => void) {
  const [busy, setBusy] = useState(false);
  const [activeKind, setActiveKind] = useState<ImportKind | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SteamImportProgress | null>(null);
  const [wishlistProgress, setWishlistProgress] = useState<SteamWishlistImportProgress | null>(null);
  const autoImportRan = useRef(false);

  useEffect(() => {
    if (!steamLinked || autoImportRan.current) return;
    const pending = sessionStorage.getItem(PENDING_IMPORT_KEY) as ImportKind | null;
    if (!pending) return;
    autoImportRan.current = true;
    sessionStorage.removeItem(PENDING_IMPORT_KEY);
    if (pending === 'wishlist') runWishlistImport();
    else runImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steamLinked]);

  function startLink(kind: ImportKind = 'library') {
    sessionStorage.setItem(PENDING_IMPORT_KEY, kind);
    window.location.href = '/auth/steam/link';
  }

  async function runWishlistImport() {
    setBusy(true);
    setActiveKind('wishlist');
    setResult(null);
    setError(null);
    setWishlistProgress(null);

    // Mirrors runImport below (issue #245) - the import itself (one IGDB lookup per considered
    // wishlist game) runs in the background on the server rather than as part of this request, for
    // the same reverse-proxy/CDN timeout reason as library import. So this POST only confirms the
    // import started; the progress endpoint below is polled for both live counts and to detect
    // completion, instead of waiting on the POST's response for either.
    try {
      await gamesApi.importSteamWishlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import your Steam wishlist');
      setBusy(false);
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const { progress: latest } = await gamesApi.importSteamWishlistProgress();
        if (!latest) return;
        if (!latest.done) {
          setWishlistProgress(latest);
          return;
        }

        clearInterval(pollInterval);
        setWishlistProgress(null);
        setResult(
          latest.imported === 0
            ? `No new wishlist games to add (checked ${latest.consideredCount} of ${latest.totalWishlisted} wishlisted).`
            : `Added ${latest.imported} game${latest.imported === 1 ? '' : 's'} to your Wishlist (skipped ${latest.skipped}, checked ${latest.consideredCount} of ${latest.totalWishlisted} wishlisted).`,
        );
        if (latest.imported > 0) onImported();
        setBusy(false);
      } catch {
        // A failed poll just means the next tick tries again - the import itself isn't affected.
      }
    }, PROGRESS_POLL_INTERVAL_MS);
  }

  async function runImport() {
    setBusy(true);
    setActiveKind('library');
    setResult(null);
    setError(null);
    setProgress(null);

    // The import itself (one IGDB lookup per unowned game) runs in the background on the server
    // rather than as part of this request - a big library can take minutes, well past what a
    // reverse proxy/CDN in front of the server holds a connection open for. So this POST only
    // confirms the import started; the progress endpoint below is polled for both live counts and
    // to detect completion, instead of waiting on the POST's response for either.
    try {
      await gamesApi.importSteamLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import your Steam library');
      setBusy(false);
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const { progress: latest } = await gamesApi.importSteamLibraryProgress();
        if (!latest) return;
        if (!latest.done) {
          setProgress(latest);
          return;
        }

        clearInterval(pollInterval);
        setProgress(null);
        setResult(
          latest.imported === 0
            ? `No new games to add (checked ${latest.consideredCount} of ${latest.totalOwned} owned).`
            : `Added ${latest.imported} game${latest.imported === 1 ? '' : 's'} (skipped ${latest.skipped}, checked ${latest.consideredCount} of ${latest.totalOwned} owned).`,
        );
        if (latest.imported > 0) onImported();
        setBusy(false);
      } catch {
        // A failed poll just means the next tick tries again - the import itself isn't affected.
      }
    }, PROGRESS_POLL_INTERVAL_MS);
  }

  return { busy, activeKind, result, error, progress, wishlistProgress, startLink, runImport, runWishlistImport };
}
