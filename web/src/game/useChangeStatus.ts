import type { Game, GameStatus } from '@queueup/shared';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { STATUS_LABEL } from '../lib/gameView';

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
    const say = (message: string) => ui.notify(message, { label: 'Undo', run: () => ops.updateStatus(game.id, previous) }, UNDO_MS);
    if (status === 'playing') say(`${game.title} is now Playing`);
    else if (status === 'done') {
      say(`${game.title} marked Beaten`);
      ui.openDialog('review', { gameId: game.id });
    } else if (status === 'paused') {
      say(`${game.title} paused`);
    } else if (status === 'wont_play') {
      say(`${game.title} marked Won't Play`);
    } else if (status === 'replay') {
      say(`${game.title} marked Replay`);
      ui.openDialog('review', { gameId: game.id });
    } else if (status === 'dropped') {
      say(`${game.title} marked Dropped`);
      ui.openDialog('review', { gameId: game.id });
    } else {
      say(`${game.title} moved to ${STATUS_LABEL[status]}`);
    }
  };
}
