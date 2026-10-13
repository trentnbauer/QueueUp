import type { Game, GameStatus } from '@queueup/shared';
import { useScope } from '../../context/ScopeContext';
import { STATUS_DESC } from '../../lib/gameView';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { OFF_PATH_EMOJI, mainPath, offPath } from './cardLogic';
import { Kicker } from './ui';
import { cardStatusLabel } from './statusLabel';

/** Set status: the journey (numbered steps), the four "off the path" statuses, and your achievements up top when there are some.
 * Picking one changes the status; the finished ones then open the review sheet by themselves (see useChangeStatus). */
export function StatusPicker({ game, onPick }: { game: Game; onPick: (status: GameStatus) => void }) {
  const t = useT();
  const { isShelf } = useScope();
  const path = mainPath(isShelf);
  const at = path.indexOf(game.status);
  const ach = game.myAchievements;
  const pct = ach && ach.total > 0 ? Math.round((ach.unlocked / ach.total) * 100) : 0;

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      {ach && ach.total > 0 && (
        <div style={st('display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:14px;background:var(--surf)')}>
          <span style={st('font-size:18px;line-height:1')}>🏆</span>
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px')}>
            <span style={st('display:flex;justify-content:space-between;align-items:baseline;gap:8px')}>
              <span style={st('font:600 13.5px var(--font-ui)')}>{t('card.status.achievements', { unlocked: ach.unlocked, total: ach.total })}</span>
              <span style={st('font:600 11.5px var(--font-mono);color:var(--accText)')}>{pct}%</span>
            </span>
            <span style={st('display:block;height:4px;border-radius:999px;background:var(--chip);overflow:hidden')}>
              <span style={st(`display:block;height:100%;border-radius:999px;background:var(--acc);width:${pct}%`)} />
            </span>
          </span>
        </div>
      )}

      <Kicker>{t('card.status.journey')}</Kicker>
      <div style={st('position:relative;display:flex;flex-direction:column;gap:2px')}>
        <span aria-hidden style={st('position:absolute;left:27px;top:26px;bottom:26px;width:2px;border-radius:2px;background:var(--chip)')} />
        {path.map((k, i) => {
          const on = i === at;
          const past = at >= 0 && i < at;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(k)}
              aria-current={on ? 'step' : undefined}
              className="hv-surf2"
              style={st(`position:relative;display:flex;align-items:center;gap:12px;min-height:54px;padding:6px 12px;border:none;border-radius:16px;text-align:left;color:var(--text);background:${on ? 'var(--accSoft)' : 'transparent'}`)}
            >
              <span
                style={st(
                  `width:32px;height:32px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 12px var(--font-ui);background:${on || past ? 'var(--acc)' : 'var(--surf2)'};color:${on || past ? 'var(--ink)' : 'var(--muted)'};box-shadow:${on ? '0 0 0 4px var(--accA25)' : '0 0 0 3px var(--sheet)'}`,
                )}
              >
                {past ? '✓' : i + 1}
              </span>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{cardStatusLabel(k)}</span>
                <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{STATUS_DESC[k]}</span>
              </span>
              {on && <span style={st('font:700 14px var(--font-ui);color:var(--accText)')}>{t('card.status.current')}</span>}
            </button>
          );
        })}
      </div>

      <Kicker>{t('card.status.offPath')}</Kicker>
      <div style={st('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px')}>
        {offPath().map((k) => {
          const on = game.status === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(k)}
              aria-pressed={on}
              className="hv-surf2"
              style={st(`display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 12px;border-radius:16px;text-align:left;color:var(--text);background:${on ? 'var(--accSoft)' : 'var(--surf)'};border:1px solid ${on ? 'var(--accA45)' : 'transparent'}`)}
            >
              <span style={st('font-size:18px;line-height:1')}>{OFF_PATH_EMOJI[k]}</span>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 13.5px var(--font-ui)')}>{cardStatusLabel(k)}</span>
                <span style={st('font:400 11px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{STATUS_DESC[k]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
