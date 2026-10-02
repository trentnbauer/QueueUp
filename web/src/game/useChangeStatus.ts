import type { Game, GameStatus } from '@queueup/shared';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';

/** Status changes from the detail panel, nudges and Play Next. Marking something Beaten or Dropped opens the
 * review sheet - and so does tapping Beaten on a game that's already Beaten, so a game beaten
 * before reviews existed (or via bulk/completion sync, which skip the sheet) can still be reviewed.
 * The toasts match the design ("X is now Playing", "X marked Beaten"). */
export function useChangeStatus() {
  const { ops } = useScope();
  const ui = useUi();
  return (game: Game, status: GameStatus) => {
    if (game.status === status) {
      if (status === 'done' || status === 'dropped') ui.openDialog('review', { gameId: game.id, edit: true });
      return;
    }
    ops.updateStatus(game.id, status);
    if (status === 'playing') ui.notify(`${game.title} is now Playing`);
    else if (status === 'done') {
      ui.notify(`${game.title} marked Beaten`);
      ui.openDialog('review', { gameId: game.id });
    } else if (status === 'wont_play') {
      ui.notify(`${game.title} marked Won't Play`);
    } else if (status === 'dropped') {
      ui.notify(`${game.title} marked Dropped`);
      ui.openDialog('review', { gameId: game.id });
    }
  };
}
