import type { GameStatus } from '@queueup/shared';
import { t } from '../../i18n';
import { STATUS_LABEL } from '../../lib/gameView';

/** A leading emoji (and the space after it): the shared labels carry one for Paused and Replay, which the card shows on its own. */
export function stripLeadingEmoji(label: string): string {
  return label.replace(/^[\p{Extended_Pictographic}️‍]+\s*/u, '');
}

/** The status word on the card: "Up next" (not "Play Next") and no emoji, since the emoji sits in its own badge. */
export function cardStatusLabel(status: GameStatus): string {
  return status === 'play_next' ? t('game.detail.journey.upNext') : stripLeadingEmoji(STATUS_LABEL[status]);
}
