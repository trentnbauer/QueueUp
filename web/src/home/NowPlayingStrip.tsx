import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Most games listed; the rest are one tab away. */
const MAX_SHOWN = 3;

/** A slim strip above the list on desktop: what's being played right now, with how many sessions in. Only there when something is
 * Playing. Tapping a game opens its card. */
export function NowPlayingStrip() {
  const t = useT();
  const ui = useUi();
  const { games, room, isShelf } = useScope();
  const playing = games.filter((g) => g.status === 'playing');
  if (playing.length === 0) return null;
  const sessionHours = isShelf ? null : (room?.typicalSessionHours ?? null);

  return (
    <div style={st('display:flex;flex-direction:column;gap:6px;flex-shrink:0')}>
      {playing.slice(0, MAX_SHOWN).map((g) => {
        const sessions = sessionHours && g.currentPlaytimeMinutes ? Math.floor(g.currentPlaytimeMinutes / 60 / sessionHours) : null;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => ui.selectGame(g.id)}
            className="hv-surf2"
            style={st('display:flex;align-items:center;gap:12px;min-height:52px;padding:6px 14px 6px 8px;border:none;border-radius:14px;background:var(--surf);color:var(--text);text-align:left')}
          >
            <Cover title={g.title} url={g.coverImageUrl} width={32} radius={7} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
              <span style={st('font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
              <span style={st('font:500 12px var(--font-ui);color:var(--accText)')}>
                {sessions ? t(sessions === 1 ? 'card.nowPlaying.sessions.one' : 'card.nowPlaying.sessions.other', { n: sessions }) : t('card.nowPlaying.playing')}
              </span>
            </span>
            <span aria-hidden style={st('color:var(--faint);font-size:18px')}>›</span>
          </button>
        );
      })}
      {playing.length > MAX_SHOWN && <span style={st('font:500 12px var(--font-ui);color:var(--muted);padding:0 8px')}>{t('card.nowPlaying.more', { n: playing.length - MAX_SHOWN })}</span>}
    </div>
  );
}
