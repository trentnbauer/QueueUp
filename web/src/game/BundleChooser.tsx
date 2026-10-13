import type { Game } from '@queueup/shared';
import { Dialog } from '../ui/Dialog';
import { Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { cardStatusLabel } from './card/statusLabel';

/** Opening a bundle (issue #1169): asks which of its games, then goes to that game's own card. The bundle stays on the list. */
export function BundleChooser({
  bundle,
  games,
  onPick,
  onManage,
  onClose,
}: {
  bundle: Game;
  /** The games that came out of this bundle. */
  games: Game[];
  onPick: (game: Game) => void;
  /** Open the bundle's own card (its status, price and removal). */
  onManage: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const sorted = [...games].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <Dialog
      onClose={onClose}
      title={bundle.title}
      gap={12}
      footer={
        <div style={st('display:flex;padding:12px 20px 22px;border-top:1px solid var(--chip)')}>
          <button type="button" onClick={onManage} style={st('flex:1;height:44px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text2);font:600 13.5px var(--font-ui)')}>
            {t('card.bundle.manage')}
          </button>
        </div>
      }
    >
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted);padding:0 4px')}>
        {t(sorted.length === 1 ? 'card.bundle.hint.one' : 'card.bundle.hint.other', { n: sorted.length })}
      </span>
      <span style={st('font:600 10.5px var(--font-mono);letter-spacing:0.06em;color:var(--faint);padding:0 4px')}>{t('card.bundle.which')}</span>
      <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:18px;overflow:hidden;background:var(--chip);flex-shrink:0')}>
        {sorted.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onPick(g)}
            className="hv-surf2"
            style={st('display:flex;align-items:center;gap:12px;min-height:64px;padding:8px 14px;border:none;background:var(--surf);color:var(--text);text-align:left')}
          >
            <Cover title={g.title} url={g.coverImageUrl} width={36} radius={7} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:600 14.5px var(--font-ui);overflow-wrap:anywhere')}>{g.title}</span>
              <span style={st('font:500 12px var(--font-ui);color:var(--accText)')}>{cardStatusLabel(g.status)}</span>
            </span>
            <span aria-hidden style={st('color:var(--faint);font-size:18px')}>›</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
