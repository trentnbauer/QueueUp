import type { Game } from '@queueup/shared';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { toRowItem } from '../home/derive';
import { VoteSegment } from '../home/Rows';
import { byScore, isUpcoming, prereqGame, ttbLabel } from '../lib/gameView';
import { Dialog } from '../ui/Dialog';
import { Cover } from '../ui/primitives';
import { st } from '../ui/st';

/** The pool Spin draws from, in vote order: backlog/play-next/replay, released, "play after" met. */
export function rankedPool(games: Game[]): Game[] {
  return games
    .filter((g) => ['backlog', 'play_next', 'replay'].includes(g.status) && !isUpcoming(g) && !prereqGame(g, games))
    .sort(byScore);
}

export function RankedDialog() {
  const scope = useScope();
  const ui = useUi();
  const { isShelf, games, ops } = scope;
  const list = rankedPool(games);

  return (
    <Dialog
      onClose={() => ui.closeDialog('ranked')}
      height="tall"
      bare
      padded={false}
      ariaLabel="Ranked queue"
    >
      <div style={st('flex-shrink:0;display:flex;flex-direction:column;gap:6px;padding:18px 20px 12px')}>
        <div style={st('display:flex;align-items:center;gap:12px')}>
          <span style={st('flex:1;font:700 22px var(--font-display);letter-spacing:-0.02em')}>Ranked queue</span>
          <button type="button" onClick={() => ui.closeDialog('ranked')} aria-label="Close" style={st('width:36px;height:36px;flex-shrink:0;border-radius:50%;border:none;background:var(--chip);color:var(--text);font-size:18px;line-height:1')}>
            ×
          </button>
        </div>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
          {isShelf
            ? 'Your backlog in priority order. The same pool Spin draws from.'
            : 'The same pool Spin draws from, in vote order. Votes here count straight away.'}
        </span>
      </div>
      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:0 10px 28px;display:flex;flex-direction:column;gap:2px')}>
        {list.length === 0 && (
          <div style={st('padding:32px 12px;text-align:center;font:500 14px var(--font-ui);color:var(--muted)')}>Add a backlog game to see it ranked here.</div>
        )}
        {list.map((g, i) => {
          const it = toRowItem(g, i + 1, { isShelf, tab: 'queue', searching: true, all: games });
          return (
            <div
              key={g.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                ui.closeDialog('ranked');
                ui.selectGame(g.id);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (ui.closeDialog('ranked'), ui.selectGame(g.id))}
              style={st('display:flex;align-items:center;gap:12px;padding:10px;border-radius:18px;cursor:pointer')}
              className="hv-surf"
            >
              <span style={st('width:24px;flex-shrink:0;font:700 18px var(--font-display);color:var(--rank);text-align:center')}>{i + 1}</span>
              <Cover title={g.title} url={g.coverImageUrl} width={42} radius={9} />
              <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px')}>
                <span style={st('display:flex;flex-direction:column;gap:2px;min-width:0')}>
                  <span style={st('font:600 15px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
                  <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                    {[g.genre?.split(',')[0], ttbLabel(g), it.ownSub || it.priceLabel].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <VoteSegment
                  myVote={it.myVote}
                  variant="mobile"
                  compact
                  onVote={(v) => (g.myVote === v ? ops.unvote(g.id) : ops.vote(g.id, v))}
                />
              </div>
              <div style={st('width:44px;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:1px')}>
                <span style={st(`font:700 18px var(--font-display);color:${it.scoreHot ? 'var(--pos)' : 'var(--faint)'}`)}>{it.scoreLabel}</span>
                <span style={st('font:500 10.5px var(--font-mono);color:var(--faint);white-space:nowrap')}>{it.countLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
