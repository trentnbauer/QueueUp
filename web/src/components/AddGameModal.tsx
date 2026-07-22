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
}

/** The screen shown after picking a collection from search (issue #272) - a review checklist
 * (pre-checked) rather than a single "add all" button, since a franchise can include remasters,
 * spinoffs, or regional re-releases someone might not want, and each add is still a full intake
 * (gg.deals pricing lookup) so silently kicking off a large batch from one click isn't a good
 * default. Sequential POSTs to the same single-game create endpoint everything else uses, rather
 * than a new bulk-create route - collections are small enough (capped server-side) that this
 * doesn't need its own backend path. */
function CollectionReview({ collection, roomId, onAdded, onBack }: CollectionReviewProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<CollectionGamesResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addProgress, setAddProgress] = useState<{ done: number; total: number } | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSummary, setAddSummary] = useState<string | null>(null);

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
    setAddError(null);
    setAddSummary(null);
    setAddProgress({ done: 0, total: toAdd.length });

    let added = 0;
    let failed = 0;
    for (const game of toAdd) {
      try {
        await gamesApi.create({ igdbId: game.igdbId, roomId });
        added += 1;
      } catch {
        failed += 1;
      }
      setAddProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }

    setAdding(false);
    setAddProgress(null);
    if (added > 0) onAdded();
    setAddSummary(
      failed === 0
        ? `Added ${added} game${added === 1 ? '' : 's'}.`
        : `Added ${added} game${added === 1 ? '' : 's'} - ${failed} couldn't be added.`,
    );
    if (failed > 0) setAddError(`${failed} game${failed === 1 ? '' : 's'} failed to add - try again individually from search.`);
  }

  if (loading) {
    return <div className={styles.searching}>Loading collection…</div>;
  }

  if (loadError || !data) {
    return <div className={styles.error}>{loadError ?? 'Could not load that collection'}</div>;
  }

  if (data.games.length === 0) {
    return (
      <div className={styles.searching}>
        Nothing left to add from {data.name} - every game in it is already here, or none are available
        on this platform.
      </div>
    );
  }

  return (
    <div>
      {addError && <div className={styles.error}>{addError}</div>}
      {addSummary && !addError && <div className={styles.added}>{addSummary}</div>}
      {data.truncated && (
        <div className={styles.searching}>
          Showing the first {data.games.length} games in this collection - it has more than that.
        </div>
      )}

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

      <div className={styles.collectionActions}>
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
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [activeCollection, setActiveCollection] = useState<CollectionSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAddedTitle(null);
    if (!query.trim()) {
      setResults([]);
      setCollections([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { results, collections } = await gamesApi.search(query.trim(), roomId);
        setResults(results);
        setCollections(collections);
      } catch {
        setResults([]);
        setCollections([]);
      } finally {
        setSearching(false);
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
      await gamesApi.create({ igdbId: result.igdbId, roomId });
      onAdded();
      // Stay open and keep the search results as-is so the user can add several games from the
      // same search without retyping - just mark this one as added.
      setAddedIds((prev) => new Set(prev).add(result.igdbId));
      setAddedTitle(result.title);
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
      addedTimeoutRef.current = setTimeout(() => setAddedTitle(null), 2500);
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
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
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
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {activeCollection ? (
          <CollectionReview
            collection={activeCollection}
            roomId={roomId}
            onAdded={onAdded}
            onBack={() => setActiveCollection(null)}
          />
        ) : (
          <>
            {error && <div className={styles.error}>{error}</div>}
            {addedTitle && !error && <div className={styles.added}>Added "{addedTitle}" ✓</div>}

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
