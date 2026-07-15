import { useEffect, useRef, useState } from 'react';
import type { GameIntakeCandidate, GameSearchResult } from '@squadqueue/shared';
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
  const [candidate, setCandidate] = useState<GameIntakeCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || candidate) {
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
  }, [query, candidate, roomId]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  async function handlePick(result: GameSearchResult) {
    setBusy(true);
    setError(null);
    try {
      const { preview } = await gamesApi.preview(result.igdbId, roomId);
      setCandidate(preview);
      setResults([]);
      setHighlightedIndex(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look up that game');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    try {
      await gamesApi.create({ igdbId: candidate.igdbId, roomId });
      setQuery('');
      setCandidate(null);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that game');
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    setCandidate(null);
    setQuery('');
    setError(null);
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
        handlePick(results[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setResults([]);
      setHighlightedIndex(-1);
    }
  }

  const listboxId = 'game-search-listbox';

  return (
    <>
      <form className={styles.bar} onSubmit={(e) => e.preventDefault()}>
        <input
          className={styles.input}
          placeholder="Search for a game…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
          disabled={busy || !!candidate}
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

      {!candidate && results.length > 0 && (
        <div className={styles.previewPanel}>
          <div className={`${styles.candidateList} ${styles.searchResultsList}`} role="listbox" id={listboxId}>
            {results.map((r, i) => (
              <button
                key={r.igdbId}
                id={optionId(r.igdbId)}
                type="button"
                role="option"
                aria-selected={i === highlightedIndex}
                className={`${styles.candidateOption} ${i === highlightedIndex ? styles.candidateOptionHighlighted : ''}`}
                onClick={() => handlePick(r)}
                onMouseEnter={() => setHighlightedIndex(i)}
                disabled={busy}
              >
                <div className={styles.candidateMeta}>
                  <span className={styles.candidateTitle}>
                    {r.title}
                    {r.releaseYear ? ` (${r.releaseYear})` : ''}
                  </span>
                  <span className={styles.candidatePlatform}>{r.platform}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!candidate && searching && <div className={styles.searching}>Searching…</div>}

      {candidate && (
        <div className={styles.previewPanel}>
          <div className={styles.candidateList}>
            <div className={styles.candidateOption}>
              <div className={styles.candidateMeta}>
                <span className={styles.candidateTitle}>{candidate.title}</span>
                <span className={styles.candidatePlatform}>
                  {candidate.platform}
                  {candidate.price.amount ? ` · ${candidate.price.amount} ${candidate.price.currency ?? ''}` : ''}
                </span>
              </div>
            </div>
          </div>
          <div className={styles.previewActions}>
            <button type="button" className={styles.cancelButton} onClick={handleCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={styles.confirmButton} onClick={handleConfirm} disabled={busy}>
              Add game
            </button>
          </div>
        </div>
      )}
    </>
  );
}
