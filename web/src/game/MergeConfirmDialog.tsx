import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { MergeStage, type MergeGame } from '../ui/MergeStage';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { rich, useT } from '../i18n';

export interface MergeCandidate {
  id: string;
  game: MergeGame;
}

/** Merging two games: the one that is removed slides into the one that stays (see MergeStage), and the person can flip them. `first`
 * starts as the one that goes. A re-match merge can't be flipped (the other side isn't a card on the list), and says so in its own words. */
export function MergeConfirmDialog({
  first,
  second,
  allowSwap,
  rematch,
  onConfirm,
  onCancel,
}: {
  first: MergeCandidate;
  second: MergeCandidate;
  allowSwap: boolean;
  /** A re-match onto a game already on the list: the wording changes and the two can't change places. */
  rematch?: boolean;
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
      title={rematch ? t('card.merge.rematchTitle') : t('card.merge.title')}
      gap={14}
      footer={
        <div style={st('flex-shrink:0;display:flex;gap:8px;padding:12px 20px 22px;border-top:1px solid var(--chip)')}>
          <Btn kind="ghost" height={46} padX={16} onClick={onCancel}>
            {t('common.cancel')}
          </Btn>
          <Btn kind="accent" height={46} padX={18} weight={700} style={{ flex: 1 }} onClick={() => onConfirm(remove.id, keep.id)}>
            {rematch ? t('card.merge.rematchConfirm') : t('card.merge.confirm')}
          </Btn>
        </div>
      }
    >
      {rematch && (
        <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2);text-wrap:pretty')}>
          {rich(t('card.merge.rematchIntro'), { target: <b key="t">{keep.game.title}</b> })}
        </span>
      )}
      <MergeStage
        remove={remove.game}
        keep={keep.game}
        onSwap={allowSwap ? () => setSwapped((s) => !s) : undefined}
        consequence={rematch ? t('card.merge.rematchConsequence', { keep: keep.game.title }) : undefined}
      />
    </Dialog>
  );
}
