import { useEffect, useRef, useState } from 'react';
import type { GameIntakeCandidate, GameSearchResult } from '@squadqueue/shared';
import { gamesApi } from '../api/games';
import styles from './GameInputBar.module.css';

interface GameInputBarProps {
  roomId: string | null;
  onAdded: () => void;
}

export function GameInputBar({ roomId, onAdded }: GameInputBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [candidate, setCandidate] = useState<GameIntakeCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function handlePick(result: GameSearchResult) {
    setBusy(true);
    setError(null);
    try {
      const { preview } = await gamesApi.preview(result.igdbId, roomId);
      setCandidate(preview);
      setResults([]);
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

  return (
    <>
      <form className={styles.bar} onSubmit={(e) => e.preventDefault()}>
        <input
          className={styles.input}
          placeholder="Search for a game…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy || !!candidate}
        />
      </form>

      {error && <div className={styles.error}>{error}</div>}

      {!candidate && results.length > 0 && (
        <div className={styles.previewPanel}>
          <div className={styles.candidateList}>
            {results.map((r) => (
              <button
                key={r.igdbId}
                type="button"
                className={styles.candidateOption}
                onClick={() => handlePick(r)}
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
