import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SteamStoreMatch } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import styles from './SteamMatchPicker.module.css';

interface SteamMatchPickerProps {
  gameId: string;
  gameTitle: string;
  hasExistingMatch: boolean;
  onMatched: (steamAppId: number | null) => void;
  onClose: () => void;
}

/** Lets a person manually pin which Steam release a game's gg.deals pricing should be matched to
 * (issue: manual gg.deals match) - for when the automatic match (IGDB's Steam link, then an
 * exact-title Steam store search) either found nothing or picked the wrong edition/remaster.
 * Searches Steam's own public store search (same one the automatic fallback uses), defaulting to
 * the game's title, and lets the person refine the query and pick from the results themselves. */
export function SteamMatchPicker({ gameId, gameTitle, hasExistingMatch, onMatched, onClose }: SteamMatchPickerProps) {
  const [query, setQuery] = useState(gameTitle);
  const [results, setResults] = useState<SteamStoreMatch[] | null>(null);
  const [searching, setSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const requestIdRef = useRef(0);

  useEffect(() => {
    runSearch(gameTitle);
    // Only re-runs when the picker is opened for a (possibly different) game - subsequent
    // searches are user-triggered via handleSubmit below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  async function runSearch(q: string) {
    const requestId = ++requestIdRef.current;
    setSearching(true);
    setError(null);
    try {
      const { results: found } = await gamesApi.steamSearch(gameId, q);
      if (requestId === requestIdRef.current) setResults(found);
    } catch {
      if (requestId === requestIdRef.current) setError('Could not search Steam right now.');
    } finally {
      if (requestId === requestIdRef.current) setSearching(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) runSearch(query.trim());
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-label="Fix Steam match" onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Fix Steam match</span>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.searchRow}>
          <input
            type="text"
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Steam by title…"
            aria-label="Search Steam by title"
            autoFocus
          />
          <button type="submit" className={styles.searchButton} disabled={searching}>
            Search
          </button>
        </form>

        {error && <div className={styles.error}>{error}</div>}
        {searching && <div className={styles.searching}>Searching…</div>}

        {!searching && !error && results && results.length === 0 && (
          <div className={styles.empty}>No matches on Steam for that title.</div>
        )}

        {!searching && results && results.length > 0 && (
          <div className={styles.resultsList}>
            {results.map((r) => (
              <button
                key={r.steamAppId}
                type="button"
                className={styles.resultOption}
                onClick={() => onMatched(r.steamAppId)}
              >
                <span className={styles.thumb} style={r.thumbnailUrl ? { backgroundImage: `url(${r.thumbnailUrl})` } : undefined} />
                <span className={styles.resultTitle}>{r.title}</span>
              </button>
            ))}
          </div>
        )}

        {hasExistingMatch && (
          <button type="button" className={styles.clearButton} onClick={() => onMatched(null)}>
            Clear match (show as unavailable)
          </button>
        )}
      </div>
    </div>
  );
}
