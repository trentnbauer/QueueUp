import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { rankedPool } from '../dialogs/RankedDialog';
import { toRowItem } from '../home/derive';
import { ttbLabel } from '../lib/gameView';
import { Cover } from '../ui/primitives';
import { st } from '../ui/st';

const SECTION = 'font:600 11.5px var(--font-mono);letter-spacing:0.08em;color:var(--muted)';
const LINE = 'display:flex;align-items:center;gap:12px;padding:8px;margin:0 -8px;border-radius:14px;border:none;background:transparent;color:var(--text);text-align:left';

/** Desktop right panel when nothing is selected: Spin card, now playing, top of the queue. */
export function GlancePanel() {
  const scope = useScope();
  const ui = useUi();
  const { isShelf, room, games } = scope;
  const now = games.filter((g) => g.status === 'playing');
  const pool = rankedPool(games);
  const top = pool.slice(0, 5);

  return (
    <div style={st('height:100%;overflow-y:auto;padding:28px 24px 32px;display:flex;flex-direction:column;gap:26px')}>
      <div style={st('display:flex;flex-direction:column;gap:4px')}>
        <span style={st(SECTION)}>AT A GLANCE</span>
        <span style={st('font:700 24px/1.1 var(--font-display);letter-spacing:-0.02em')}>{isShelf ? 'Personal Shelf' : room?.name}</span>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:20px;background:linear-gradient(150deg, var(--hero1), var(--surf))')}>
        <span style={st('font:700 19px/1.15 var(--font-display);letter-spacing:-0.01em')}>Can't decide?</span>
        <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>
          {isShelf ? 'Spin picks from your backlog, weighted by your hype.' : 'Spin picks from the queue. Higher squad votes land more often.'}{' '}
          {pool.length} {pool.length === 1 ? 'game' : 'games'} in the pool.
        </span>
        <button
          type="button"
          onClick={() => ui.openDialog('spin')}
          style={st('align-self:flex-start;height:42px;padding:0 22px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:800 14px var(--font-display);box-shadow:0 6px 20px var(--accA30)')}
        >
          Spin
        </button>
      </div>
      {now.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:8px')}>
          <span style={st(SECTION)}>NOW PLAYING · {now.length}</span>
          {now.map((g) => (
            <button key={g.id} type="button" className="hv-surf" onClick={() => ui.selectGame(g.id)} style={st(LINE)}>
              <Cover title={g.title} url={g.coverImageUrl} width={40} radius={8} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
                  {[g.genre?.split(',')[0], ttbLabel(g)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {top.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:8px')}>
          <div style={st('display:flex;align-items:baseline;justify-content:space-between')}>
            <span style={st(SECTION)}>TOP OF THE QUEUE</span>
            <button type="button" onClick={() => ui.openDialog('ranked')} style={st('border:none;background:none;padding:0;color:var(--accText);font:600 12.5px var(--font-ui)')}>
              Full ranking ›
            </button>
          </div>
          {top.map((g, i) => {
            const it = toRowItem(g, i + 1, { isShelf, tab: 'queue', searching: true, all: games });
            return (
              <button key={g.id} type="button" className="hv-surf" onClick={() => ui.selectGame(g.id)} style={st(LINE)}>
                <span style={st('width:18px;flex-shrink:0;font:700 15px var(--font-display);color:var(--rank);text-align:center')}>{i + 1}</span>
                <Cover title={g.title} url={g.coverImageUrl} width={34} radius={7} />
                <span style={st('flex:1;min-width:0;font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
                <span style={st(`font:700 15px var(--font-display);color:${it.scoreHot ? 'var(--pos)' : 'var(--faint)'}`)}>{it.scoreLabel}</span>
              </button>
            );
          })}
        </div>
      )}
      <span style={st('margin-top:auto;font:400 12.5px var(--font-ui);color:var(--faint)')}>Select a game to see its details here.</span>
    </div>
  );
}
