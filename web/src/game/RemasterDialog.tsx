import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import type { MergeGame } from '../ui/MergeStage';
import { RemasterStage } from '../ui/RemasterStage';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

export interface RemasterSide {
  id: string;
  game: MergeGame;
}

/** Is one of these a remaster or a remake of the other? The two link up (nothing is merged), the person picks which kind right here, and
 * can say which is the original. Save stays off until a kind is picked. `newer` starts as the game the person is on. */
export function RemasterDialog({
  newer,
  original,
  initialKind = null,
  busy,
  onSave,
  onClose,
}: {
  newer: RemasterSide;
  original: RemasterSide;
  /** The kind the AI suggested, already picked (it can still be changed). */
  initialKind?: 'remaster' | 'remake' | null;
  busy: boolean;
  /** The id of the remaster / remake, then of the original. */
  onSave: (kind: 'remaster' | 'remake', newerId: string, originalId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [swapped, setSwapped] = useState(false);
  const [kind, setKind] = useState<'remaster' | 'remake' | null>(initialKind);
  const orig = swapped ? newer : original;
  const nw = swapped ? original : newer;

  const option = (k: 'remaster' | 'remake') => {
    const on = kind === k;
    return (
      <button
        key={k}
        type="button"
        aria-pressed={on}
        disabled={busy}
        onClick={() => setKind(k)}
        className="hv-surf2"
        style={st(`display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:16px;border:none;background:var(--surf);color:var(--text);text-align:left;box-shadow:${on ? '0 0 0 2px var(--acc)' : 'none'}`)}
      >
        <span style={st('font:700 14.5px var(--font-ui)')}>{t(k === 'remaster' ? 'game.remaster.kind.remaster' : 'game.remaster.kind.remake')}</span>
        <span style={st('font:400 12px/1.4 var(--font-ui);color:var(--muted)')}>{t(k === 'remaster' ? 'game.remaster.kind.remasterHint' : 'game.remaster.kind.remakeHint')}</span>
      </button>
    );
  };

  return (
    <Dialog
      onClose={onClose}
      title={t('game.remaster.title')}
      gap={14}
      footer={
        <div style={st('flex-shrink:0;display:flex;gap:8px;padding:12px 20px 22px;border-top:1px solid var(--chip)')}>
          <Btn kind="ghost" height={46} padX={16} onClick={onClose}>
            {t('common.cancel')}
          </Btn>
          <Btn kind="accent" height={46} padX={18} weight={700} style={{ flex: 1, opacity: kind ? 1 : 0.4 }} disabled={!kind || busy} onClick={() => kind && onSave(kind, nw.id, orig.id)}>
            {t('common.save')}
          </Btn>
        </div>
      }
    >
      <RemasterStage original={orig.game} newer={nw.game} kind={kind} onSwap={() => setSwapped((s) => !s)} />
      <div style={st('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px')}>
        {option('remaster')}
        {option('remake')}
      </div>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-align:center;text-wrap:pretty')}>
        {kind
          ? t('game.remaster.consequence', { title: nw.game.title, kind: t(kind === 'remake' ? 'game.remaster.kind.remake' : 'game.remaster.kind.remaster').toLowerCase(), original: orig.game.title })
          : t('game.remaster.pickToSave')}
      </span>
    </Dialog>
  );
}
