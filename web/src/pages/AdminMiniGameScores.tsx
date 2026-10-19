import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LobbyGameId } from '@queueup/shared';
import { LOBBY_GAME_IDS } from '@queueup/shared';
import { adminApi } from '../api/admin';
import { useConfirm } from '../context/ConfirmContext';
import { MINIGAMES_QUERY_KEY } from '../hooks/useMiniGames';
import { LOBBY_GAME_VIEWS } from '../lobbyGames';
import { Btn, Collapsible } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Reset the saved mini game high scores (Administrator page): one game's, or all of them. Asks first, since it cannot be undone. */
export function AdminMiniGameScores(): ReactNode {
  const t = useT();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function reset(game?: LobbyGameId) {
    const title = game ? t('pages.admin.miniScoresConfirmTitle', { game: t(LOBBY_GAME_VIEWS[game].nameKey) }) : t('pages.admin.miniScoresConfirmAllTitle');
    if (!(await confirm({ title, message: t('pages.admin.miniScoresConfirmMessage'), confirmLabel: t('pages.admin.miniScoresReset'), danger: true }))) return;
    setBusy(game ?? 'all');
    setError(false);
    setMessage(null);
    try {
      const { removed } = await adminApi.resetMiniGameScores(game);
      setMessage(t('pages.admin.miniScoresDone', { n: removed }));
      void qc.invalidateQueries({ queryKey: MINIGAMES_QUERY_KEY });
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Collapsible
      title={t('pages.admin.miniScores')}
      actions={
        <Btn kind="ghost" height={30} padX={10} fontSize={12.5} disabled={busy !== null} onClick={() => void reset()}>
          {t('pages.admin.miniScoresResetAll')}
        </Btn>
      }
    >
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>{t('pages.admin.miniScoresHint')}</span>
      {message && <span style={st('font:500 13px var(--font-ui);color:var(--mint)')}>{message}</span>}
      {error && <span style={st('font:400 13px var(--font-ui);color:var(--danger)')}>{t('pages.common.loadFailed')}</span>}
      <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)')}>
        {LOBBY_GAME_IDS.map((game) => (
          <div key={game} style={st('display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--surf)')}>
            <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t(LOBBY_GAME_VIEWS[game].nameKey)}</span>
            <Btn kind="ghost" height={30} padX={10} fontSize={12.5} disabled={busy !== null} onClick={() => void reset(game)}>
              {t('pages.admin.miniScoresReset')}
            </Btn>
          </div>
        ))}
      </div>
    </Collapsible>
  );
}
