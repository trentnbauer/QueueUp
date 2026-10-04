import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SteamStoreMatch } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { Dialog } from '../ui/Dialog';
import { inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** "Fix Steam match": search Steam's store and pin the release a game's prices should come from. */
export function SteamMatchSheet({
  gameId,
  gameTitle,
  hasExistingMatch,
  onMatched,
  onClose,
}: {
  gameId: string;
  gameTitle: string;
  hasExistingMatch: boolean;
  onMatched: (steamAppId: number | null) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState(gameTitle);
  const [results, setResults] = useState<SteamStoreMatch[] | null>(null);
  const [searching, setSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  async function run(q: string) {
    const id = ++requestId.current;
    setSearching(true);
    setError(null);
    try {
      const { results: found } = await gamesApi.steamSearch(gameId, q);
      if (id === requestId.current) setResults(found);
    } catch {
      if (id === requestId.current) setError(t('game.steamMatch.error'));
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  }

  useEffect(() => {
    void run(gameTitle);
    // Only when opened for a different game - later searches are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) void run(query.trim());
  }

  return (
    <Dialog onClose={onClose} title={t('game.steamMatch.title')} gap={12}>
      <form onSubmit={submit} style={st('display:flex;gap:8px')}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('game.steamMatch.placeholder')}
          aria-label={t('game.steamMatch.aria')}
          autoFocus
          style={st(`flex:1;min-width:0;${inputPill}`)}
        />
        <button type="submit" disabled={searching} style={st('height:44px;padding:0 16px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui);opacity:' + (searching ? 0.5 : 1))}>
          {t('common.search')}
        </button>
      </form>
      {error && <div role="alert" style={st('padding:12px 14px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13.5px/1.4 var(--font-ui)')}>{error}</div>}
      {searching && <div style={st('color:var(--muted);font-size:14px')}>{t('game.steamMatch.searching')}</div>}
      {!searching && !error && results && results.length === 0 && (
        <div style={st('color:var(--muted);font-size:14px')}>{t('game.steamMatch.noResults')}</div>
      )}
      {!searching && results && results.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:18px;overflow:hidden;background:var(--chip)')}>
          {results.map((r) => (
            <button
              key={r.steamAppId}
              type="button"
              onClick={() => onMatched(r.steamAppId)}
              style={st('display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 14px;border:none;background:var(--surf);color:var(--text);text-align:left')}
            >
              <span
                style={{
                  width: 46,
                  height: 22,
                  flexShrink: 0,
                  borderRadius: 4,
                  background: r.thumbnailUrl ? `url("${r.thumbnailUrl}") center/cover no-repeat` : 'var(--surf2)',
                }}
              />
              <span style={st('flex:1;min-width:0;font:600 14.5px var(--font-ui)')}>{r.title}</span>
              <span style={st('height:30px;padding:0 12px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 12.5px var(--font-ui);display:flex;align-items:center')}>{t('game.steamMatch.pick')}</span>
            </button>
          ))}
        </div>
      )}
      {hasExistingMatch && (
        <button
          type="button"
          onClick={() => onMatched(null)}
          style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--danger);font:600 13.5px var(--font-ui)')}
        >
          {t('game.steamMatch.clear')}
        </button>
      )}
    </Dialog>
  );
}
