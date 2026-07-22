import { useEffect, useRef, useState } from 'react';
import type { GameSearchResult } from '@queueup/shared';
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

/** Centered modal (matching Room Settings / Add Room) for searching and adding a game - replaces
 * the old always-visible inline search bar above the game grid. */
export function AddGameModal({ roomId, onAdded, onClose }: AddGameModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [addedTitle, setAddedTitle] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  // Bumped on every new search so a response for an older query can recognize it's stale and
  // avoid overwriting the results of a newer one that resolved first.
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
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
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++latestRequestIdRef.current;
      setSearching(true);
      try {
        const { results } = await gamesApi.search(query.trim(), roomId);
        if (requestId !== latestRequestIdRef.current) return;
        setResults(results);
      } catch {
        if (requestId !== latestRequestIdRef.current) return;
        setResults([]);
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
          <span className={styles.title}>Add a Game</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

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

        <div className={styles.cancelZone}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
