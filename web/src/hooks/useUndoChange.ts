import { useQueryClient } from '@tanstack/react-query';
import { DUPLICATE_COUNT_QUERY_KEY, DUPLICATE_LIST_QUERY_KEY, MERGED_GAMES_QUERY_KEY, gamesApi } from '../api/games';
import { PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { useUi } from '../context/UiContext';
import { UNDO_MS } from '../game/useChangeStatus';
import { t } from '../i18n';

/** Shows a toast for a merge or re-match with an Undo button, when the server gave back a token for it
 * (it keeps one for a few minutes). Undoing brings the game(s) back and refreshes every list that showed
 * them. Without a token the message is shown on its own. */
export function useUndoChange() {
  const ui = useUi();
  const queryClient = useQueryClient();
  return (message: string, token: string | undefined | null) => {
    if (!token) {
      ui.notify(message);
      return;
    }
    ui.notify(
      message,
      {
        label: t('common.undo'),
        run: () => {
          gamesApi
            .undoChange(token)
            .then(() => {
              void queryClient.invalidateQueries({ queryKey: ['games'] });
              void queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
              void queryClient.invalidateQueries({ queryKey: DUPLICATE_COUNT_QUERY_KEY });
              void queryClient.invalidateQueries({ queryKey: DUPLICATE_LIST_QUERY_KEY });
              void queryClient.invalidateQueries({ queryKey: MERGED_GAMES_QUERY_KEY });
              ui.notify(t('shell.undo.done'));
            })
            .catch((err) => ui.showError(err instanceof Error ? err.message : t('shell.undo.failed')));
        },
      },
      UNDO_MS,
    );
  };
}
