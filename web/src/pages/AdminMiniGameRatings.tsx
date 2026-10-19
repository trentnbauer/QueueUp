import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import { LOBBY_GAME_VIEWS } from '../lobbyGames';
import { Btn, Collapsible } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const percent = (share: number | null) => (share === null ? '—' : `${Math.round(share * 100)}%`);

/** How people rated each mini game with the thumbs at the end of a run (Administrator page): counts only, never who
 * voted. Lowest-rated first, so the games to rework or drop are at the top. */
export function AdminMiniGameRatings(): ReactNode {
  const t = useT();
  const ratings = useQuery({ queryKey: ['admin', 'minigame-ratings'], queryFn: adminApi.miniGameRatings });
  const games = [...(ratings.data?.games ?? [])].sort((a, b) => (a.upShare ?? 2) - (b.upShare ?? 2) || b.total - a.total);

  return (
    <Collapsible
      title={t('pages.admin.miniRatings')}
      actions={
        <Btn kind="ghost" height={30} padX={10} fontSize={12.5} disabled={ratings.isFetching} onClick={() => void ratings.refetch()}>
          {t('pages.admin.emailLogRefresh')}
        </Btn>
      }
    >
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>{t('pages.admin.miniRatingsHint')}</span>
      {ratings.isError && <span style={st('font:400 13px var(--font-ui);color:var(--danger)')}>{t('pages.common.loadFailed')}</span>}
      {games.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)')}>
          <div style={st('display:grid;grid-template-columns:minmax(0,1fr) 54px 54px 54px 54px 82px;gap:8px;padding:8px 14px;background:var(--surf);font:500 10.5px var(--font-mono);letter-spacing:.06em;color:var(--faint)')}>
            <span>{t('pages.admin.miniRatingsGame')}</span>
            <span style={st('text-align:right')}>👍</span>
            <span style={st('text-align:right')}>👎</span>
            <span style={st('text-align:right')}>{t('pages.admin.miniRatingsTotal')}</span>
            <span style={st('text-align:right')}>{t('pages.admin.miniRatingsShare')}</span>
            <span style={st('text-align:right')}>{t('pages.admin.miniRatingsWeek')}</span>
          </div>
          {games.map((g) => (
            <div key={g.game} style={st('display:grid;grid-template-columns:minmax(0,1fr) 54px 54px 54px 54px 82px;gap:8px;align-items:center;padding:10px 14px;background:var(--surf);font:500 13px var(--font-mono)')}>
              <span style={st('font:600 13.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t(LOBBY_GAME_VIEWS[g.game].nameKey)}</span>
              <span style={st('text-align:right')}>{g.up}</span>
              <span style={st('text-align:right')}>{g.down}</span>
              <span style={st('text-align:right')}>{g.total}</span>
              <span style={st('text-align:right')}>{percent(g.upShare)}</span>
              <span style={st('text-align:right;color:var(--muted)')}>
                {g.upWeek}/{g.downWeek}
              </span>
            </div>
          ))}
        </div>
      )}
    </Collapsible>
  );
}
