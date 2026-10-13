import { useMemo, useState } from 'react';
import type { Game } from '@queueup/shared';
import { Dialog } from '../ui/Dialog';
import { inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { useMergeCompanies } from './mergeGame';

/** Most rows whose developer and publisher are looked up at once (one cheap request); the rest show year, platform and genre. */
const DETAIL_ROWS = 19;

/** "Duplicate?" (issue #848): pick another game already in this list to merge this card into, or (mode `remaster`) the original this card is
 * a remaster or remake of. Same-name games sit next to each other in date order, with what tells them apart (developer, publisher, genre). */
export function DuplicateSheet({
  game,
  games,
  onPick,
  onClose,
  mode = 'merge',
}: {
  game: Game;
  games: Game[];
  onPick: (target: Game) => void;
  onClose: () => void;
  mode?: 'merge' | 'remaster';
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const when = (g: Game) => g.releaseDate ?? (g.releaseYear ? `${g.releaseYear}` : '');
    return games
      .filter((g) => g.id !== game.id)
      .filter((g) => !q || g.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title) || when(a).localeCompare(when(b)));
  }, [games, game.id, query]);
  const companies = useMergeCompanies([game.igdbId, ...candidates.slice(0, DETAIL_ROWS).map((g) => g.igdbId)]);

  const line1 = (g: Game) => [g.releaseYear, g.platform].filter(Boolean).join(' · ');
  const line2 = (g: Game) => [companies[g.igdbId]?.developer, companies[g.igdbId]?.publisher, g.genre?.split(',')[0]?.trim()].filter(Boolean).join(' · ');
  const cover = (g: Game, w: number, h: number, r: number) => (
    <span style={{ width: w, height: h, flexShrink: 0, borderRadius: r, background: g.coverImageUrl ? `url("${g.coverImageUrl}") center/cover no-repeat` : 'var(--surf2)' }} />
  );

  return (
    <Dialog onClose={onClose} title={t(mode === 'remaster' ? 'game.remaster.title' : 'game.duplicate.title')} gap={12}>
      <div style={st('display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:14px;background:var(--surf)')}>
        {cover(game, 30, 45, 4)}
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
          <span style={st('font:600 14.5px var(--font-ui);overflow-wrap:anywhere')}>{game.title}</span>
          <span style={st('color:var(--muted);font:400 12.5px var(--font-ui)')}>{line1(game)}</span>
          {line2(game) && <span style={st('color:var(--faint);font:400 12px var(--font-ui)')}>{line2(game)}</span>}
        </span>
        <span style={st('flex-shrink:0;font:700 10.5px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('game.duplicate.thisGame')}</span>
      </div>
      <div style={st('color:var(--muted);font:400 13.5px/1.4 var(--font-ui)')}>{t(mode === 'remaster' ? 'game.remaster.hint' : 'game.duplicate.hint', { title: game.title })}</div>
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
              {cover(g, 36, 48, 4)}
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 14.5px var(--font-ui);overflow-wrap:anywhere')}>{g.title}</span>
                <span style={st('color:var(--muted);font:400 12.5px var(--font-ui)')}>{line1(g)}</span>
                {line2(g) && <span style={st('color:var(--faint);font:400 12px var(--font-ui);overflow-wrap:anywhere')}>{line2(g)}</span>}
              </span>
              <span style={st('flex-shrink:0;height:30px;padding:0 12px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 12.5px var(--font-ui);display:flex;align-items:center')}>
                {t(mode === 'remaster' ? 'game.remaster.pick' : 'game.duplicate.mergeInto')}
              </span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
