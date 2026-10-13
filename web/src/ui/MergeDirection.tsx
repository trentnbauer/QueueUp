import { Cover } from './primitives';
import { st } from './st';
import { useT } from '../i18n';

export interface MergeSide {
  title: string;
  coverImageUrl: string | null;
}

/** Which game a merge keeps and which goes: the box art of the one that is removed, crossed out with ❌, then an arrow into the
 * one that stays. `onSwap` flips the two. */
export function MergeDirection({ remove, keep, onSwap, disabled }: { remove: MergeSide; keep: MergeSide; onSwap?: () => void; disabled?: boolean }) {
  const t = useT();
  const side = (g: MergeSide, removed: boolean) => (
    <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:8px')}>
      <div style={st('position:relative;display:flex')}>
        <div style={st(`display:flex;${removed ? 'opacity:0.45;filter:grayscale(0.6)' : 'box-shadow:0 0 0 3px var(--mint);border-radius:12px'}`)}>
          <Cover title={g.title} url={g.coverImageUrl} width={84} radius={10} />
        </div>
        {removed && (
          <span aria-hidden style={st('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;line-height:1;text-shadow:0 2px 8px oklch(0 0 0 / 0.6)')}>
            ❌
          </span>
        )}
      </div>
      <span style={st(`font:700 10.5px var(--font-mono);letter-spacing:0.06em;color:${removed ? 'var(--danger)' : 'var(--mint)'}`)}>{removed ? t('card.merge.removed') : t('card.merge.kept')}</span>
      <span style={st('max-width:100%;font:600 13.5px/1.3 var(--font-ui);text-align:center;overflow-wrap:anywhere;text-wrap:balance')}>{g.title}</span>
    </div>
  );
  return (
    <div style={st('display:flex;flex-direction:column;align-items:center;gap:10px')}>
      <div style={st('width:100%;display:flex;align-items:flex-start;gap:6px')}>
        {side(remove, true)}
        <span aria-hidden style={st('flex-shrink:0;align-self:center;font:700 26px var(--font-ui);color:var(--muted);padding-bottom:42px')}>→</span>
        {side(keep, false)}
      </div>
      {onSwap && (
        <button
          type="button"
          onClick={onSwap}
          disabled={disabled}
          style={st('height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text2);font:600 12.5px var(--font-ui)')}
        >
          ⇄ {t('card.merge.swap')}
        </button>
      )}
    </div>
  );
}
