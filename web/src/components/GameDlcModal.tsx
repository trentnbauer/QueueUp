import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Game, GameSearchResult } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import styles from './GameDlcModal.module.css';

interface GameDlcModalProps {
  /** The base game this modal is browsing DLC for - already known to not itself be DLC (see the
   * "View DLC" button's own guard in GameDetailModal), so every result here is IGDB's own
   * dlcs/expansions list for this exact title. */
  game: Game;
  onClose: () => void;
}

function DlcResultThumb({ title, coverImageUrl }: { title: string; coverImageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [coverImageUrl]);

  return (
    <div className={styles.resultThumb} style={coverImageUrl && !failed ? { backgroundImage: `url(${coverImageUrl})` } : undefined}>
      {coverImageUrl && !failed && (
        <img src={coverImageUrl} alt="" aria-hidden="true" className={styles.resultThumbProbe} onError={() => setFailed(true)} />
      )}
      {(!coverImageUrl || failed) && <span className={styles.resultThumbFallback}>{(Array.from(title)[0] ?? '').toUpperCase()}</span>}
    </div>
  );
}

/** Issue #338's "Add a DLC button to the game modal that opens another modal and displays all DLC
 * ... for people to add to the backlog queue" - browses IGDB's own dlcs/expansions list for `game`
 * and lets each be added with one click, the same igdbId-driven create flow AddGameModal uses.
 * A newly-added DLC gets linked back to `game` automatically server-side (see linkDlcToBaseGame) -
 * this modal doesn't need to set that up itself. */
export function GameDlcModal({ game, onClose }: GameDlcModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const queryClient = useQueryClient();
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  // Which of addedIds became a pending suggestion rather than landing directly in the backlog
  // (issue #362 - a room with requireGameApproval on) - drives the per-row button label below, same
  // distinction AddGameModal's own suggestedIds makes.
  const [suggestedIds, setSuggestedIds] = useState<Set<number>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    gamesApi
      .dlc(game.id)
      .then(({ results }) => {
        if (!cancelled) setResults(results);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load DLC for this game.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  async function handleAdd(result: GameSearchResult) {
    setAddingId(result.igdbId);
    setActionError(null);
    try {
      const response = await gamesApi.create({ igdbId: result.igdbId, roomId: game.roomId });
      setAddedIds((prev) => new Set(prev).add(result.igdbId));
      // Issue #362: this room requires approval and the caller is a plain Member - nothing was
      // added to the backlog yet (and there's no baseGameId link to have been set either, since
      // linkDlcToBaseGame only runs once a suggestion is actually approved into a real game row).
      if ('suggestion' in response) {
        setSuggestedIds((prev) => new Set(prev).add(result.igdbId));
        return;
      }
      // The list this game's own DLC lives in (shelf or this room) just gained a row, including
      // the new baseGameId backlink - broad invalidation (not a targeted cache patch) since the
      // create response doesn't carry enough for GameGrid's grouping/ordering to react to on its
      // own, the same reasoning useGames' `move` mutation already uses for a cross-list change.
      await queryClient.invalidateQueries({ queryKey: ['games'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add that DLC.');
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`DLC for ${game.title}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>DLC for {game.title}</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {actionError && <div className={styles.error}>{actionError}</div>}

        {loading && <div className={styles.loading}>Loading…</div>}
        {!loading && loadError && <div className={styles.error}>{loadError}</div>}
        {!loading && !loadError && results.length === 0 && (
          <div className={styles.empty}>No DLC found for this game on IGDB.</div>
        )}

        {!loading && !loadError && results.length > 0 && (
          <div className={styles.resultsList}>
            {results.map((result) => {
              const added = addedIds.has(result.igdbId);
              return (
                <div key={result.igdbId} className={styles.resultOption}>
                  <DlcResultThumb title={result.title} coverImageUrl={result.coverImageUrl} />
                  <div className={styles.resultMeta}>
                    <span className={styles.resultTitle}>
                      {result.title}
                      {result.releaseYear ? ` (${result.releaseYear})` : ''}
                    </span>
                    <span className={styles.resultPlatform}>{result.platform}</span>
                  </div>
                  <button
                    type="button"
                    className={`${styles.addButton} ${added ? styles.addButtonAdded : ''}`}
                    onClick={() => handleAdd(result)}
                    disabled={addingId !== null || added}
                  >
                    {addingId === result.igdbId
                      ? 'Adding…'
                      : added
                        ? suggestedIds.has(result.igdbId)
                          ? 'Suggested ✓'
                          : 'Added ✓'
                        : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
