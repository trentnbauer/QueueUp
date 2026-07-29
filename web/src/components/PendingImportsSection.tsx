import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, type PendingLibraryImportDto } from '@queueup/shared';
import { pendingImportsApi, PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { AddGameModal, ResultThumb } from './AddGameModal';
import profileStyles from '../views/ProfileSettingsView.module.css';
import addGameStyles from './AddGameModal.module.css';
import styles from './PendingImportsSection.module.css';

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
  onSearchManually: () => void;
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

      <button type="button" className={profileStyles.linkButton} onClick={onSearchManually} disabled={busy}>
        None of these - search manually
      </button>
    </div>
  );
}

/** Profile Settings' Playnite review queue (#452) - titles a Playnite import (or any future
 * external-library source) couldn't auto-resolve to an igdbId land in `PendingLibraryImport`
 * (server-side, shipped with the bulk import endpoint itself) rather than vanishing; this is the
 * "glance at a few candidate covers and click" UI to clear them at the user's own pace, since a
 * 1000+ game library's unresolved fraction is expected to be small but shouldn't be a one-shot
 * list that's lost if the import tab gets closed.
 *
 * Picking a candidate hits the same resolve route the whole feature was designed around
 * (POST .../resolve, which internally goes through createGameForUser/resolveGameForCreation - the
 * exact same intake path a normal Add Game uses, so a resolved entry gets identical cover/genre/
 * pricing richness). "None of these" reuses AddGameModal outright instead of building a second
 * search UI - a title IGDB's own search didn't confidently match already got its best shot at
 * import time; a person typing a better query is the fallback, not a UI this component should
 * reimplement.
 *
 * Renders nothing when the queue is empty (the common case - most users never see this section),
 * rather than a permanent "0 pending" row nobody asked to see. */
export function PendingImportsSection() {
  const queryClient = useQueryClient();
  const [searchingForId, setSearchingForId] = useState<string | null>(null);
  // Tracks whether the manual-search fallback already dismissed its pending row this session -
  // AddGameModal's onAdded can fire more than once (it deliberately stays open after an add so
  // someone can add several games from one search), but this pending entry should only ever be
  // dismissed once, on the first successful add, not every subsequent unrelated one.
  const dismissedForSearchRef = useRef(false);

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

  function openManualSearch(id: string) {
    dismissedForSearchRef.current = false;
    setSearchingForId(id);
  }

  function handleManualAdded() {
    if (searchingForId && !dismissedForSearchRef.current) {
      dismissedForSearchRef.current = true;
      dismiss.mutate(searchingForId);
    }
  }

  const error = resolve.error ?? dismiss.error ?? loadError;
  const errorMessage = error instanceof Error ? error.message : error ? 'Something went wrong with the review queue' : null;

  if (pending.length === 0 && !errorMessage) return null;

  return (
    <div className={profileStyles.section}>
      <div className={profileStyles.sectionTitle}>Needs review ({pending.length})</div>
      <p className={profileStyles.hint}>
        These titles came in from an import but didn't confidently match a game - pick the right one below, or
        search for it yourself if none of the candidates are right.
      </p>
      {errorMessage && <div className={profileStyles.error}>{errorMessage}</div>}

      <div className={styles.list}>
        {pending.map((entry) => (
          <PendingImportRow
            key={entry.id}
            entry={entry}
            resolving={resolve.isPending && resolve.variables?.id === entry.id}
            dismissing={dismiss.isPending && dismiss.variables === entry.id}
            onResolve={(igdbId) => resolve.mutate({ id: entry.id, igdbId })}
            onDismiss={() => dismiss.mutate(entry.id)}
            onSearchManually={() => openManualSearch(entry.id)}
          />
        ))}
      </div>

      {searchingForId && (
        <AddGameModal roomId={null} onAdded={handleManualAdded} onClose={() => setSearchingForId(null)} />
      )}
    </div>
  );
}
