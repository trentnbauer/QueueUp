import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, type PendingLibraryImportDto } from '@queueup/shared';
import { pendingImportsApi, PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { ResultThumb } from '../components/AddGameModal';
import { PendingImportMatchModal } from '../components/PendingImportMatchModal';
import profileStyles from './ProfileSettingsView.module.css';
import addGameStyles from '../components/AddGameModal.module.css';
import styles from './NeedsReviewView.module.css';

// Same root key useGames.ts builds ['games', 'shelf'|'room', ...] under - a resolved pending entry
// either creates a new shelf game or unions ownership platforms onto an existing one, either way
// stale until the shelf list refetches.
const GAMES_QUERY_ROOT = ['games'];

interface PendingImportRowProps {
  entry: PendingLibraryImportDto;
  resolving: boolean;
  dismissing: boolean;
  onResolve: (igdbId: number) => void;
  onDismiss: () => void;
  onSearchManually: (entry: PendingLibraryImportDto) => void;
}

function PendingImportRow({ entry, resolving, dismissing, onResolve, onDismiss, onSearchManually }: PendingImportRowProps) {
  const busy = resolving || dismissing;
  const platformLabels = entry.platforms.map((p) => ROOM_PLATFORM_LABELS[p]).join(', ') || 'unknown platform';

  return (
    <div className={styles.row}>
      <div className={styles.rowHeader}>
        <div>
          <div className={styles.rowTitle}>{entry.title}</div>
          <div className={styles.rowMeta}>
            {platformLabels} · via {entry.source.charAt(0).toUpperCase() + entry.source.slice(1)}
          </div>
        </div>
        <button type="button" className={profileStyles.unlinkButton} onClick={onDismiss} disabled={busy}>
          {dismissing ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>

      {entry.candidates.length > 0 ? (
        <div className={addGameStyles.resultsList}>
          {entry.candidates.map((c) => (
            <button
              key={c.igdbId}
              type="button"
              className={`${addGameStyles.resultOption} ${styles.candidateButton}`}
              onClick={() => onResolve(c.igdbId)}
              disabled={busy}
            >
              <ResultThumb title={c.title} coverImageUrl={c.coverImageUrl} />
              <div className={addGameStyles.resultMeta}>
                <span className={addGameStyles.resultTitle}>
                  {c.title}
                  {c.releaseYear ? ` (${c.releaseYear})` : ''}
                </span>
                <span className={addGameStyles.resultPlatform}>{c.platform}</span>
              </div>
              <span className={addGameStyles.addButton}>{resolving ? 'Adding…' : 'This one'}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.noCandidates}>No close matches found.</p>
      )}

      <button type="button" className={profileStyles.linkButton} onClick={() => onSearchManually(entry)} disabled={busy}>
        None of these - search manually
      </button>
    </div>
  );
}

/** Review queue for `PendingLibraryImport` rows - titles a Playnite import (or any future
 * external-library source) couldn't auto-resolve to an igdbId land here rather than vanishing.
 * Used to be buried in Profile Settings (as PendingImportsSection) - a page nobody thought to
 * check for "did my import finish matching everything," the same complaint pattern as #469's
 * Playnite setup guide - so it's its own top-level sidebar destination instead, for the same
 * reason. This is the "glance at a few candidate covers and click" UI to clear entries at your own
 * pace, since a 1000+ game library's unresolved fraction is expected to be small but shouldn't be
 * a one-shot list that's lost if the review tab gets closed.
 *
 * Picking a candidate (or a "search manually" pick, via PendingImportMatchModal) hits the same
 * resolve route the whole feature was designed around (POST .../resolve, which unions ownership
 * onto an already-owned game or otherwise goes through createGameForUser/resolveGameForCreation -
 * the exact same intake path a normal Add Game uses, so a resolved entry gets identical
 * cover/genre/pricing richness). "None of these" opens a dedicated search modal rather than
 * reusing AddGameModal outright - AddGameModal's own search excludes already-owned games (the
 * normal anti-duplicate behavior for adding a brand new game), which would hide the exact case
 * this queue often needs: matching an already-owned game onto a new platform.
 *
 * Unlike the old Profile-Settings-embedded PendingImportsSection, this always renders its page
 * chrome (title/hint) even when the queue is empty - a dedicated destination that silently showed
 * nothing would look broken, whereas the old embedded section could just vanish since it was one
 * section among several already-visible ones. */
export function NeedsReviewView() {
  const queryClient = useQueryClient();
  const [searchingFor, setSearchingFor] = useState<{ id: string; title: string } | null>(null);

  const { data, error: loadError } = useQuery({ queryKey: PENDING_IMPORTS_QUERY_KEY, queryFn: pendingImportsApi.list });
  const pending = data?.pending ?? [];

  const resolve = useMutation({
    mutationFn: ({ id, igdbId }: { id: string; igdbId: number }) => pendingImportsApi.resolve(id, igdbId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
    },
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => pendingImportsApi.dismiss(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY }),
  });

  function handleManualMatchResolved() {
    setSearchingFor(null);
    queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
  }

  const error = resolve.error ?? dismiss.error ?? loadError;
  const errorMessage = error instanceof Error ? error.message : error ? 'Something went wrong with the review queue' : null;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Needs Review{pending.length > 0 ? ` (${pending.length})` : ''}</h1>
      <p className={styles.hint}>
        These titles came in from an import but didn't confidently match a game - pick the right one below, or
        search for it yourself if none of the candidates are right.
      </p>
      {errorMessage && <div className={profileStyles.error}>{errorMessage}</div>}

      {pending.length === 0 && !errorMessage && (
        <p className={styles.empty}>You're all caught up - nothing needs review right now.</p>
      )}

      <div className={styles.list}>
        {pending.map((entry) => (
          <PendingImportRow
            key={entry.id}
            entry={entry}
            resolving={resolve.isPending && resolve.variables?.id === entry.id}
            dismissing={dismiss.isPending && dismiss.variables === entry.id}
            onResolve={(igdbId) => resolve.mutate({ id: entry.id, igdbId })}
            onDismiss={() => dismiss.mutate(entry.id)}
            onSearchManually={(entry) => setSearchingFor({ id: entry.id, title: entry.title })}
          />
        ))}
      </div>

      {searchingFor && (
        <PendingImportMatchModal
          pendingId={searchingFor.id}
          initialQuery={searchingFor.title}
          onResolved={handleManualMatchResolved}
          onClose={() => setSearchingFor(null)}
        />
      )}
    </div>
  );
}
