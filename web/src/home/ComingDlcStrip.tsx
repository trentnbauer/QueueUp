import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpcomingDlc } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { releaseShortDate } from '../lib/gameView';
import { Btn, Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const UPCOMING_DLC_QUERY_KEY = ['upcoming-dlc'] as const;
const GAMES_QUERY_ROOT = ['games'];

/** DLC and expansions releasing soon for games on the shelf (issue #869), under the Coming soon
 * strip. Each can go on the wishlist (then it shows in the strip above like any other upcoming
 * game) or be ignored for good. Renders nothing when there is none. */
export function ComingDlcStrip(): ReactNode {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: UPCOMING_DLC_QUERY_KEY, queryFn: gamesApi.upcomingDlc, staleTime: 5 * 60 * 1000 });

  const drop = (igdbId: number) =>
    queryClient.setQueryData<{ dlcs: UpcomingDlc[] }>(UPCOMING_DLC_QUERY_KEY, (cur) => (cur ? { dlcs: cur.dlcs.filter((d) => d.igdbId !== igdbId) } : cur));

  const wishlist = useMutation({
    mutationFn: (d: UpcomingDlc) => gamesApi.create({ igdbId: d.igdbId, roomId: null, status: 'wishlist' }),
    onSuccess: (_res, d) => {
      drop(d.igdbId);
      void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
      ui.notify(t('home.comingDlc.wishlisted', { title: d.title }));
    },
    onError: (err) => ui.notify(err instanceof Error ? err.message : t('home.comingDlc.failed')),
  });
  const ignore = useMutation({
    mutationFn: (d: UpcomingDlc) => gamesApi.ignoreUpcomingDlc(d.igdbId),
    onSuccess: (_res, d) => {
      drop(d.igdbId);
      ui.notify(t('home.comingDlc.ignored', { title: d.title }));
    },
    onError: (err) => ui.notify(err instanceof Error ? err.message : t('home.comingDlc.failed')),
  });

  const dlcs = data?.dlcs ?? [];
  if (dlcs.length === 0) return null;
  const busy = wishlist.isPending || ignore.isPending;

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('home.comingDlc.heading', { n: dlcs.length })}</span>
      <div style={st('display:flex;gap:10px;overflow-x:auto;margin:0 -16px;padding:0 16px')}>
        {dlcs.map((d) => (
          <div key={d.igdbId} style={st('flex-shrink:0;width:290px;display:flex;flex-direction:column;gap:10px;padding:10px;border-radius:18px;background:var(--surf)')}>
            <div style={st('display:flex;align-items:center;gap:12px;min-width:0')}>
              <Cover title={d.title} url={d.coverImageUrl} width={44} radius={9} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
                <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{d.title}</span>
                <span style={st('font:400 12px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t('home.comingDlc.for', { title: d.baseGameTitle })}</span>
                <span style={st('font:500 12px var(--font-ui);color:var(--accText)')}>{t('home.release.releases', { date: releaseShortDate(d.releaseDate) })}</span>
              </span>
            </div>
            <div style={st('display:flex;gap:8px')}>
              <Btn kind="soft" height={34} padX={12} fontSize={12.5} disabled={busy} onClick={() => wishlist.mutate(d)}>
                {t('home.comingDlc.addWishlist')}
              </Btn>
              <Btn kind="ghost" height={34} padX={12} fontSize={12.5} disabled={busy} onClick={() => ignore.mutate(d)}>
                {t('home.comingDlc.ignore')}
              </Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
