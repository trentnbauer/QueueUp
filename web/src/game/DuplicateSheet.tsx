import { useMemo, useState } from 'react';
import type { Game } from '@queueup/shared';
import { Dialog } from '../ui/Dialog';
import { inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** "Duplicate?" (issue #848): pick another game already in this list to merge this card into. */
export function DuplicateSheet({
  game,
  games,
  onPick,
  onClose,
}: {
  game: Game;
  games: Game[];
  onPick: (target: Game) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games
      .filter((g) => g.id !== game.id)
      .filter((g) => !q || g.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [games, game.id, query]);

  return (
    <Dialog onClose={onClose} title={t('game.duplicate.title')} gap={12}>
      <div style={st('color:var(--muted);font:400 13.5px/1.4 var(--font-ui)')}>{t('game.duplicate.hint', { title: game.title })}</div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('game.duplicate.placeholder')}
        aria-label={t('game.duplicate.placeholder')}
        autoFocus
        style={st(`min-width:0;${inputPill}`)}
      />
      {candidates.length === 0 && <div style={st('color:var(--muted);font-size:14px')}>{t('game.duplicate.none')}</div>}
      {candidates.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:18px;overflow:hidden;background:var(--chip);max-height:50vh;overflow-y:auto')}>
          {candidates.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onPick(g)}
              style={st('display:flex;align-items:center;gap:12px;min-height:64px;padding:8px 14px;border:none;background:var(--surf);color:var(--text);text-align:left')}
            >
              <span
                style={{
                  width: 36,
                  height: 48,
                  flexShrink: 0,
                  borderRadius: 4,
                  background: g.coverImageUrl ? `url("${g.coverImageUrl}") center/cover no-repeat` : 'var(--surf2)',
                }}
              />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{g.title}</span>
                <span style={st('color:var(--muted);font:400 12.5px var(--font-ui)')}>{[g.releaseYear, g.platform].filter(Boolean).join(' · ')}</span>
              </span>
              <span style={st('height:30px;padding:0 12px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 12.5px var(--font-ui);display:flex;align-items:center')}>{t('game.igdbMatch.merge')}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
