import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { MergeDirection, type MergeSide } from '../ui/MergeDirection';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

export interface MergeCandidate extends MergeSide {
  id: string;
}

/** Merging two games: shows which one goes and which one stays (box art, ❌ on the one that goes, an arrow into the one that stays),
 * and lets the person flip them. `first` starts as the one that goes. Where one side isn't a card on the list yet (a re-match), the
 * two can't be flipped. */
export function MergeConfirmDialog({
  first,
  second,
  allowSwap,
  onConfirm,
  onCancel,
}: {
  first: MergeCandidate;
  second: MergeCandidate;
  allowSwap: boolean;
  /** The id of the game that goes, and of the one that stays. */
  onConfirm: (removeId: string, keepId: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [swapped, setSwapped] = useState(false);
  const remove = swapped ? second : first;
  const keep = swapped ? first : second;

  return (
    <Dialog
      onClose={onCancel}
      title={t('card.merge.title')}
      gap={14}
      footer={
        <div style={st('flex-shrink:0;display:flex;gap:8px;padding:12px 20px 22px;border-top:1px solid var(--chip)')}>
          <Btn kind="ghost" height={46} padX={16} onClick={onCancel}>
            {t('common.cancel')}
          </Btn>
          <Btn kind="accent" height={46} padX={18} weight={700} style={{ flex: 1 }} onClick={() => onConfirm(remove.id, keep.id)}>
            {t('card.merge.confirm')}
          </Btn>
        </div>
      }
    >
      <MergeDirection remove={remove} keep={keep} onSwap={allowSwap ? () => setSwapped((s) => !s) : undefined} />
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-align:center;text-wrap:pretty')}>
        {t('card.merge.consequence', { remove: remove.title, keep: keep.title })}
      </span>
    </Dialog>
  );
}
