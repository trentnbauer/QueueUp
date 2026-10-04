import type { Game, GameStatus } from '@queueup/shared';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { STATUS_LABEL } from '../lib/gameView';
import { t } from '../i18n';

/** How long the Undo toast stays up. */
export const UNDO_MS = 7000;

/** Status changes from the detail panel, nudges and Play Next. Marking something Beaten, Replay or Dropped opens the
 * review sheet - and so does tapping Beaten on a game that's already Beaten, so a game beaten
 * before reviews existed (or via bulk/completion sync, which skip the sheet) can still be reviewed.
 * The toasts match the design ("X is now Playing", "X marked Beaten") and carry an Undo button. */
export function useChangeStatus() {
  const { ops } = useScope();
  const ui = useUi();
  return (game: Game, status: GameStatus) => {
    if (game.status === status) {
      if (status === 'done' || status === 'dropped' || status === 'replay') ui.openDialog('review', { gameId: game.id, edit: true });
      return;
    }
    const previous = game.status;
    ops.updateStatus(game.id, status);
    // Every status change can be taken back from the toast for a few seconds.
    const say = (message: string) => ui.notify(message, { label: t('common.undo'), run: () => ops.updateStatus(game.id, previous) }, UNDO_MS);
    if (status === 'playing') say(t('game.status.playing', { title: game.title }));
    else if (status === 'done') {
      say(t('game.status.beaten', { title: game.title }));
      ui.openDialog('review', { gameId: game.id });
    } else if (status === 'paused') {
      say(t('game.status.paused', { title: game.title }));
    } else if (status === 'wont_play') {
      say(t('game.status.wontPlay', { title: game.title }));
    } else if (status === 'replay') {
      say(t('game.status.replay', { title: game.title }));
      ui.openDialog('review', { gameId: game.id });
    } else if (status === 'dropped') {
      say(t('game.status.dropped', { title: game.title }));
      ui.openDialog('review', { gameId: game.id });
    } else {
      say(t('game.status.moved', { title: game.title, status: STATUS_LABEL[status] }));
    }
  };
}
