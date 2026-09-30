import type { Game, GameStatus } from '@queueup/shared';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';

/** Status changes from the detail panel, nudges and Play Next. Marking something Beaten opens the
 * review sheet; the toasts match the design ("X is now Playing", "X marked Beaten"). Bulk and
 * completion-sync Beatens deliberately skip this (and so skip the review). */
export function useChangeStatus() {
  const { ops } = useScope();
  const ui = useUi();
  return (game: Game, status: GameStatus) => {
    if (game.status === status) return;
    ops.updateStatus(game.id, status);
    if (status === 'playing') ui.notify(`${game.title} is now Playing`);
    else if (status === 'done') {
      ui.notify(`${game.title} marked Beaten`);
      ui.openDialog('review', { gameId: game.id });
    }
  };
}
