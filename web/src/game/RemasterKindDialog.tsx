import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Is this a remaster (the same game, better graphics) or a remake (rebuilt from the ground up)? */
export function RemasterKindDialog({ title, original, busy, onPick, onClose }: { title: string; original: string; busy: boolean; onPick: (kind: 'remaster' | 'remake') => void; onClose: () => void }) {
  const t = useT();
  const option = (kind: 'remaster' | 'remake') => (
    <button
      key={kind}
      type="button"
      disabled={busy}
      onClick={() => onPick(kind)}
      className="hv-surf2"
      style={st('display:flex;flex-direction:column;gap:3px;padding:14px 16px;border-radius:16px;border:none;background:var(--surf);color:var(--text);text-align:left;opacity:' + (busy ? 0.6 : 1))}
    >
      <span style={st('font:700 15px var(--font-ui)')}>{t(kind === 'remaster' ? 'game.remaster.kind.remaster' : 'game.remaster.kind.remake')}</span>
      <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>{t(kind === 'remaster' ? 'game.remaster.kind.remasterHint' : 'game.remaster.kind.remakeHint')}</span>
    </button>
  );
  return (
    <Dialog onClose={onClose} title={t('game.remaster.kind.title')} gap={12}>
      <div style={st('color:var(--muted);font:400 13.5px/1.4 var(--font-ui)')}>{t('game.remaster.kind.question', { title, original })}</div>
      {option('remaster')}
      {option('remake')}
    </Dialog>
  );
}
