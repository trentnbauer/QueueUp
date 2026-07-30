import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GameSearchResult } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { pendingImportsApi } from '../api/pendingImports';
import { useModalA11y, closeOnBackdropMouseDown } from '../hooks/useModalA11y';
import { ResultThumb } from './AddGameModal';
import modalStyles from './ImportLibraryModal.module.css';
import addGameStyles from './AddGameModal.module.css';
import idMatchStyles from './PendingImportMatchModal.module.css';

const DEBOUNCE_MS = 350;

interface PendingImportMatchModalProps {
  pendingId: string;
  initialQuery: string;
  onResolved: () => void;
  onClose: () => void;
}

/** "None of these - search manually" fallback for a pending-import review row (PendingImportsSection)
 * - a dedicated, lightweight search-and-pick modal rather than reusing the full AddGameModal.
 * AddGameModal's own search excludes every igdbId already on the shelf (the normal Add Game
 * anti-duplicate behavior), which made matching an already-owned game onto a *new* platform
 * (e.g. you own it on Steam, Playnite says you also have it on Switch) impossible - the base game
 * never showed up in results, only its unowned DLC/add-ons did. This search opts into
 * `includeOwned` (see /api/games/search) to surface it, and resolves a pick straight through the
 * existing pending-import resolve endpoint (which already unions the new platform onto an
 * existing game rather than trying to create a duplicate) instead of AddGameModal's normal
 * create/ownership-picker flow, which doesn't apply here since the platforms to grant already
 * live on the pending row server-side.
 *
 * Also offers a "match by IGDB ID" fallback below the title search, for when the title itself is
 * too ambiguous to pick out by search alone (e.g. a franchise with a dozen like-titled releases -
 * Assassin's Creed, Call of Duty, etc.) - a person who's found the specific edition on IGDB's own
 * site can paste its numeric id straight in rather than hunting through search results. Submits
 * through the same handlePick/resolve path as a normal candidate pick, so a nonexistent id surfaces
 * whatever error the server's own lookup returns, rather than needing its own validation round-trip. */
export function PendingImportMatchModal({ pendingId, initialQuery, onResolved, onClose }: PendingImportMatchModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [igdbIdQuery, setIgdbIdQuery] = useState('');
  // Guards against a slower, earlier request's response overwriting a faster, later one's -
  // same pattern AddGameModal's own search uses.
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      latestRequestIdRef.current++;
      setResults([]);
      setSearching(false);
      return;
    }

    const requestId = ++latestRequestIdRef.current;
    setSearching(true);
    const handle = setTimeout(() => {
      gamesApi
        .search(trimmed, null, 0, true, true)
        .then(({ results }) => {
          if (latestRequestIdRef.current !== requestId) return;
          setResults(results);
          setError(null);
        })
        .catch((err) => {
          if (latestRequestIdRef.current !== requestId) return;
          setError(err instanceof Error ? err.message : 'Search failed');
        })
        .finally(() => {
          if (latestRequestIdRef.current === requestId) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query]);

  async function handlePick(igdbId: number) {
    setResolvingId(igdbId);
    setError(null);
    try {
      await pendingImportsApi.resolve(pendingId, igdbId);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not match this game');
      setResolvingId(null);
    }
  }

  function handleIgdbIdSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = igdbIdQuery.trim();
    // Digits-only, not just Number.isInteger: Number() also accepts things like "1e3" or "0x10"
    // as valid integers, which would silently match the wrong igdbId for anyone pasting one in.
    if (!/^\d+$/.test(trimmed)) {
      setError('Enter a valid IGDB game ID (a positive whole number).');
      return;
    }
    handlePick(Number(trimmed));
  }

  return (
    <div className={modalStyles.backdrop} role="presentation" onMouseDown={closeOnBackdropMouseDown(onClose)}>
      <div
        ref={dialogRef}
        className={modalStyles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Find a match"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={modalStyles.header}>
          <span className={modalStyles.title}>Find a match</span>
          <button type="button" className={modalStyles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <input
          className={addGameStyles.input}
          placeholder="Search for a game…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={resolvingId !== null}
          autoFocus
        />

        {error && <div className={addGameStyles.error}>{error}</div>}
        {searching && <div className={addGameStyles.searching}>Searching…</div>}
        {!searching && !error && query.trim() && results.length === 0 && (
          <div className={addGameStyles.searching}>No matches found.</div>
        )}

        <div className={addGameStyles.resultsList}>
          {results.map((r) => (
            <button
              key={r.igdbId}
              type="button"
              className={addGameStyles.resultOption}
              onClick={() => handlePick(r.igdbId)}
              disabled={resolvingId !== null}
            >
              <ResultThumb title={r.title} coverImageUrl={r.coverImageUrl} />
              <div className={addGameStyles.resultMeta}>
                <span className={addGameStyles.resultTitle}>
                  {r.title}
                  {r.releaseYear ? ` (${r.releaseYear})` : ''}
                </span>
                <span className={addGameStyles.resultPlatform}>{r.platform}</span>
              </div>
              <span className={addGameStyles.addButton}>{resolvingId === r.igdbId ? 'Matching…' : 'This one'}</span>
            </button>
          ))}
        </div>

        <div className={idMatchStyles.idMatchZone}>
          <span className={idMatchStyles.idMatchHint}>Can't find it by title? Match by IGDB game ID instead.</span>
          <form onSubmit={handleIgdbIdSubmit} className={idMatchStyles.idMatchRow}>
            <input
              type="text"
              inputMode="numeric"
              className={idMatchStyles.idMatchInput}
              placeholder="IGDB ID, e.g. 1234"
              value={igdbIdQuery}
              onChange={(e) => setIgdbIdQuery(e.target.value)}
              disabled={resolvingId !== null}
              aria-label="IGDB game ID"
            />
            <button type="submit" className={idMatchStyles.idMatchButton} disabled={resolvingId !== null || !igdbIdQuery.trim()}>
              {resolvingId !== null ? 'Matching…' : 'Match'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
