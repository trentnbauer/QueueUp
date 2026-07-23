import { useEffect, useRef, useState } from 'react';
import type { CollectionGamesResult, CollectionSearchResult, GameSearchResult } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useModalA11y } from '../hooks/useModalA11y';
import styles from './AddGameModal.module.css';

interface AddGameModalProps {
  roomId: string | null;
  onAdded: () => void;
  onClose: () => void;
}

function optionId(igdbId: number): string {
  return `add-game-option-${igdbId}`;
}

interface CollectionReviewProps {
  collection: CollectionSearchResult;
  roomId: string | null;
  onAdded: () => void;
  onBack: () => void;
  /** Lets the parent modal disable its own close controls while a batch add is running - closing
   * mid-batch previously left the add loop running invisibly in the background with no way for the
   * user to know, since nothing stopped it and the parent had no idea it was in progress. */
  onBusyChange: (busy: boolean) => void;
}

/** The screen shown after picking a collection from search (issue #272) - a review checklist
 * (pre-checked) rather than a single "add all" button, since a franchise can include remasters,
 * spinoffs, or regional re-releases someone might not want, and each add is still a full intake
 * (gg.deals pricing lookup) so silently kicking off a large batch from one click isn't a good
 * default. Sequential POSTs to the same single-game create endpoint everything else uses, rather
 * than a new bulk-create route - collections are small enough (capped server-side) that this
 * doesn't need its own backend path. */
function CollectionReview({ collection, roomId, onAdded, onBack, onBusyChange }: CollectionReviewProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<CollectionGamesResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addProgress, setAddProgress] = useState<{ done: number; total: number } | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSummary, setAddSummary] = useState<string | null>(null);
  // Belt-and-suspenders alongside onBusyChange disabling the parent's close controls - if the
  // component ever unmounts some other way while a batch add is in flight, this stops the loop
  // from starting any *further* creates, rather than letting it run to completion invisibly.
  const cancelledRef = useRef(false);

  useEffect(() => {
    // Resetting here (not just on cleanup) matters in dev: React 18 StrictMode mounts, unmounts,
    // and remounts every component once on purpose to shake out exactly this class of bug - the
    // first (simulated) unmount's cleanup sets this true, and without resetting it back to false
    // on the second (real) mount, every batch add silently no-oped forever afterward (it would
    // immediately see cancelledRef.current === true and break before the first create). Harmless
    // in production, where there's no such double-invoke.
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    gamesApi
      .collectionGames(collection.collectionId, roomId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setSelectedIds(new Set(result.games.map((g) => g.igdbId)));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load that collection');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [collection.collectionId, roomId]);

  function toggle(igdbId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(igdbId)) next.delete(igdbId);
      else next.add(igdbId);
      return next;
    });
  }

  async function handleAddSelected() {
    if (!data || selectedIds.size === 0) return;
    const toAdd = data.games.filter((g) => selectedIds.has(g.igdbId));
    setAdding(true);
    onBusyChange(true);
    setAddError(null);
    setAddSummary(null);
    setAddProgress({ done: 0, total: toAdd.length });

    let added = 0;
    const failedIds = new Set<number>();
    // Rooms are shared backlogs, typically meant to be played together - worth calling out which
    // of a batch add have no co-op data at all (see the single-add warning below for the same
    // reasoning), rather than only surfacing that one at a time via the per-card detail modal.
    const noCoopTitles: string[] = [];
    for (const game of toAdd) {
      if (cancelledRef.current) break;
      try {
        const { game: created } = await gamesApi.create({ igdbId: game.igdbId, roomId });
        added += 1;
        if (roomId && created.maxCoopPlayers == null) noCoopTitles.push(created.title);
      } catch {
        failedIds.add(game.igdbId);
      }
      setAddProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    if (cancelledRef.current) return;

    // Drop the games that were actually added from the checklist, so a retry after a partial
    // failure only resubmits the ones that failed instead of re-creating (and getting
    // duplicate-rejected on) ones that already succeeded.
    setData((prev) => (prev ? { ...prev, games: prev.games.filter((g) => failedIds.has(g.igdbId)) } : prev));
    setSelectedIds(new Set(failedIds));

    setAdding(false);
    onBusyChange(false);
    setAddProgress(null);
    if (added > 0) onAdded();
    const failed = failedIds.size;
    let summary =
      failed === 0
        ? `Added ${added} game${added === 1 ? '' : 's'}.`
        : `Added ${added} game${added === 1 ? '' : 's'} - ${failed} couldn't be added.`;
    if (noCoopTitles.length > 0) {
      summary += ` ⚠️ No co-op data for: ${noCoopTitles.join(', ')}.`;
    }
    setAddSummary(summary);
    if (failed > 0) setAddError(`${failed} game${failed === 1 ? '' : 's'} failed to add - try again individually from search.`);
  }

  if (loading) {
    return <div className={styles.searching}>Loading collection…</div>;
  }

  if (loadError || !data) {
    return <div className={styles.error}>{loadError ?? 'Could not load that collection'}</div>;
  }

  const nothingLeft = data.games.length === 0;

  return (
    <div>
      {addError && <div className={styles.error}>{addError}</div>}
      {addSummary && !addError && <div className={styles.added}>{addSummary}</div>}
      {!addSummary && data.truncated && (
        <div className={styles.searching}>
          Showing the first {data.games.length} games in this collection - it has more than that.
        </div>
      )}

      {nothingLeft ? (
        <div className={styles.searching}>
          {addSummary
            ? 'Nothing else left to add from this collection.'
            : `Nothing left to add from ${data.name} - every game in it is already here, or none are available on this platform.`}
        </div>
      ) : (
        <div className={styles.resultsList}>
          {data.games.map((g: GameSearchResult) => (
            <label key={g.igdbId} className={styles.collectionRow}>
              <input
                type="checkbox"
                checked={selectedIds.has(g.igdbId)}
                onChange={() => toggle(g.igdbId)}
                disabled={adding}
              />
              <div className={styles.resultMeta}>
                <span className={styles.resultTitle}>
                  {g.title}
                  {g.releaseYear ? ` (${g.releaseYear})` : ''}
                </span>
                <span className={styles.resultPlatform}>{g.platform}</span>
              </div>
            </label>
          ))}
        </div>
      )}

      <div className={styles.collectionActions}>
        {!nothingLeft && (
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAddSelected}
            disabled={adding || selectedIds.size === 0}
          >
            {adding && addProgress
              ? `Adding ${addProgress.done}/${addProgress.total}…`
              : `Add ${selectedIds.size} game${selectedIds.size === 1 ? '' : 's'}`}
          </button>
        )}
        <button type="button" className={styles.cancelButton} onClick={onBack} disabled={adding}>
          Back to search
        </button>
      </div>
    </div>
  );
}

/** Centered modal (matching Room Settings / Add Room) for searching and adding a game - replaces
 * the old always-visible inline search bar above the game grid. */
export function AddGameModal({ roomId, onAdded, onClose }: AddGameModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [collections, setCollections] = useState<CollectionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [addedTitle, setAddedTitle] = useState<string | null>(null);
  const [coopWarningTitle, setCoopWarningTitle] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [activeCollection, setActiveCollection] = useState<CollectionSearchResult | null>(null);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coopWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  // Bumped on every new search so a response for an older query can recognize it's stale and
  // avoid overwriting the results of a newer one that resolved first.
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
      if (coopWarningTimeoutRef.current) clearTimeout(coopWarningTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAddedTitle(null);
    if (!query.trim()) {
      // Bump the request id here too, or a still-in-flight search from before the query was
      // cleared can resolve afterward and pass the staleness check below, overwriting this
      // intentional clear with stale results.
      ++latestRequestIdRef.current;
      setResults([]);
      setCollections([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++latestRequestIdRef.current;
      setSearching(true);
      try {
        const { results, collections } = await gamesApi.search(query.trim(), roomId);
        if (requestId !== latestRequestIdRef.current) return;
        setResults(results);
        setCollections(collections);
      } catch {
        if (requestId !== latestRequestIdRef.current) return;
        setResults([]);
        setCollections([]);
      } finally {
        if (requestId === latestRequestIdRef.current) setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, roomId]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  async function handleAdd(result: GameSearchResult) {
    setAddingId(result.igdbId);
    setError(null);
    try {
      const { game } = await gamesApi.create({ igdbId: result.igdbId, roomId });
      onAdded();
      // Stay open and keep the search results as-is so the user can add several games from the
      // same search without retyping - just mark this one as added.
      setAddedIds((prev) => new Set(prev).add(result.igdbId));
      setAddedTitle(result.title);
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
      addedTimeoutRef.current = setTimeout(() => setAddedTitle(null), 2500);

      // Rooms are shared backlogs, typically meant to be played together - a game with no co-op
      // data at all (IGDB found no multiplayer modes, or just doesn't have the data) is worth
      // flagging right when it's added, since that's the one moment someone's actually deciding
      // whether it belongs in this room. Not shown on the Personal Shelf (roomId null) - solo play
      // is the default there, so there's nothing to warn about.
      if (roomId && game.maxCoopPlayers == null) {
        setCoopWarningTitle(result.title);
        if (coopWarningTimeoutRef.current) clearTimeout(coopWarningTimeoutRef.current);
        coopWarningTimeoutRef.current = setTimeout(() => setCoopWarningTitle(null), 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that game');
    } finally {
      setAddingId(null);
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0) {
        e.preventDefault();
        handleAdd(results[highlightedIndex]);
      }
    }
  }

  const listboxId = 'add-game-listbox';
  const busy = addingId !== null;

  return (
    <div className={styles.backdrop} role="presentation" onClick={collectionBusy ? undefined : onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Add a game"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>{activeCollection ? activeCollection.name : 'Add a Game'}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={collectionBusy}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {activeCollection ? (
          <CollectionReview
            collection={activeCollection}
            roomId={roomId}
            onAdded={onAdded}
            onBack={() => setActiveCollection(null)}
            onBusyChange={setCollectionBusy}
          />
        ) : (
          <>
            {error && <div className={styles.error}>{error}</div>}
            {addedTitle && !error && <div className={styles.added}>Added "{addedTitle}" ✓</div>}
            {coopWarningTitle && !error && (
              <div className={styles.coopWarning}>⚠️ "{coopWarningTitle}" doesn't appear to support co-op</div>
            )}

            <input
              ref={inputRef}
              className={styles.input}
              placeholder="Search for a game…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={busy}
              autoFocus
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                highlightedIndex >= 0 && highlightedIndex < results.length
                  ? optionId(results[highlightedIndex].igdbId)
                  : undefined
              }
            />

            {searching && <div className={styles.searching}>Searching…</div>}

            {collections.length > 0 && (
              <div className={styles.collectionsList}>
                {collections.map((c) => (
                  <button
                    key={c.collectionId}
                    type="button"
                    className={styles.collectionOption}
                    onClick={() => setActiveCollection(c)}
                  >
                    <span aria-hidden="true">📚</span> {c.name}
                    <span className={styles.collectionHint}>View series</span>
                  </button>
                ))}
              </div>
            )}

            {results.length > 0 && (
              <div className={styles.resultsList} role="listbox" id={listboxId}>
                {results.map((r, i) => (
                  <div
                    key={r.igdbId}
                    id={optionId(r.igdbId)}
                    role="option"
                    aria-selected={i === highlightedIndex}
                    className={`${styles.resultOption} ${i === highlightedIndex ? styles.resultOptionHighlighted : ''}`}
                    onMouseEnter={() => setHighlightedIndex(i)}
                  >
                    <div className={styles.resultMeta}>
                      <span className={styles.resultTitle}>
                        {r.title}
                        {r.releaseYear ? ` (${r.releaseYear})` : ''}
                      </span>
                      <span className={styles.resultPlatform}>{r.platform}</span>
                    </div>
                    <button
                      type="button"
                      className={`${styles.addButton} ${addedIds.has(r.igdbId) ? styles.addButtonAdded : ''}`}
                      onClick={() => handleAdd(r)}
                      disabled={busy || addedIds.has(r.igdbId)}
                    >
                      {addingId === r.igdbId ? 'Adding…' : addedIds.has(r.igdbId) ? 'Added ✓' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!activeCollection && (
          <div className={styles.cancelZone}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
