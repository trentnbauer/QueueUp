import { useEffect, useRef, useState } from 'react';
import type { GameSearchResult } from '@squadqueue/shared';
import { gamesApi } from '../api/games';
import styles from './GameInputBar.module.css';

interface GameInputBarProps {
  roomId: string | null;
  onAdded: () => void;
}

function optionId(igdbId: number): string {
  return `game-search-option-${igdbId}`;
}

export function GameInputBar({ roomId, onAdded }: GameInputBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { results } = await gamesApi.search(query.trim(), roomId);
        setResults(results);
      } catch {
        setResults([]);
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
      setQuery('');
      setResults([]);
      setHighlightedIndex(-1);
      onAdded();
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
    } else if (e.key === 'Escape') {
      setResults([]);
      setHighlightedIndex(-1);
    }
  }

  const listboxId = 'game-search-listbox';
  const busy = addingId !== null;

  return (
    <>
      <form className={styles.bar} onSubmit={(e) => e.preventDefault()}>
        <input
          className={styles.input}
          placeholder="Search for a game…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          disabled={busy}
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
      </form>

      {error && <div className={styles.error}>{error}</div>}

      {results.length > 0 && (
        <div className={styles.previewPanel}>
          <div className={`${styles.candidateList} ${styles.searchResultsList}`} role="listbox" id={listboxId}>
            {results.map((r, i) => (
              <div
                key={r.igdbId}
                id={optionId(r.igdbId)}
                role="option"
                aria-selected={i === highlightedIndex}
                className={`${styles.candidateOption} ${i === highlightedIndex ? styles.candidateOptionHighlighted : ''}`}
                onMouseEnter={() => setHighlightedIndex(i)}
              >
                <div className={styles.candidateMeta}>
                  <span className={styles.candidateTitle}>
                    {r.title}
                    {r.releaseYear ? ` (${r.releaseYear})` : ''}
                  </span>
                  <span className={styles.candidatePlatform}>{r.platform}</span>
                </div>
                <button
                  type="button"
                  className={styles.addButton}
                  onClick={() => handleAdd(r)}
                  disabled={busy}
                >
                  {addingId === r.igdbId ? 'Adding…' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {searching && <div className={styles.searching}>Searching…</div>}
    </>
  );
}
