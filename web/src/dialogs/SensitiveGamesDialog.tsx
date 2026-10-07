import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { Btn, Cover } from '../ui/primitives';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** After games tagged as adult by IGDB land on the Personal Shelf (an import or a manual add), ask
 * whether to hide them from the public profile and friends' activity. Ticked by default; whatever
 * the answer, those games are not asked about again. */
export function SensitiveGamesPrompt({ active, forced = false }: { active: boolean; /** Opened from a notification: shown even if it was closed earlier. */ forced?: boolean }) {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const [skipped, setSkipped] = useState(false);
  const { data } = useQuery({
    // Under the ['games'] root so any import/add that invalidates games refetches this too.
    queryKey: ['games', 'sensitive'],
    queryFn: gamesApi.sensitiveGames,
    enabled: active || forced,
  });
  const [unticked, setUnticked] = useState<string[]>([]);

  const resolve = useMutation({
    mutationFn: gamesApi.resolveSensitiveGames,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['games'] }),
    onError: () => ui.showError(t('add.sensitive.saveFailed')),
  });

  const games = data?.games ?? [];
  const close = () => {
    setSkipped(true);
    if (forced) ui.closeDialog('sensitiveGames');
  };
  // Opened from a notification that has since been answered (or hidden automatically): nothing to show.
  useEffect(() => {
    if (forced && data && games.length === 0) ui.closeDialog('sensitiveGames');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forced, data]);
  if (!(forced || (active && !skipped)) || games.length === 0) return null;

  const ids = games.map((g) => g.id);
  const hideIds = ids.filter((id) => !unticked.includes(id));
  const keepIds = ids.filter((id) => unticked.includes(id));

  return (
    <Dialog
      title={t('add.sensitive.title')}
      width={560}
      onClose={close}
      footer={
        <div style={st('display:flex;gap:10px;justify-content:flex-end;padding:14px 20px')}>
          <Btn
            height={42}
            onClick={() => {
              resolve.mutate({ hideIds: [], keepIds: ids });
              close();
            }}
          >
            {t('add.sensitive.keepAll')}
          </Btn>
          <Btn
            kind="accent"
            height={42}
            onClick={() => {
              resolve.mutate({ hideIds, keepIds });
              ui.notify(hideIds.length > 0 ? t(hideIds.length === 1 ? 'add.sensitive.hidden.one' : 'add.sensitive.hidden.other', { n: hideIds.length }) : t('add.sensitive.leftVisible'));
              close();
            }}
          >
            {hideIds.length > 0 ? t('add.sensitive.hideN', { n: hideIds.length }) : t('common.done')}
          </Btn>
        </div>
      }
    >
      <span style={st('font:400 14px/1.45 var(--font-ui);color:var(--muted)')}>
        {t(games.length === 1 ? 'add.sensitive.body.one' : 'add.sensitive.body.other')}
      </span>
      <div style={st('display:flex;flex-direction:column;gap:6px')}>
        {games.map((g) => {
          const hide = !unticked.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              role="checkbox"
              aria-checked={hide}
              onClick={() => setUnticked((u) => (u.includes(g.id) ? u.filter((x) => x !== g.id) : [...u, g.id]))}
              style={st('display:flex;align-items:center;gap:12px;padding:8px 12px 8px 8px;border-radius:14px;border:none;background:var(--surf);color:var(--text);text-align:left')}
            >
              <span
                style={st(
                  `width:22px;height:22px;flex-shrink:0;border-radius:7px;border:2px solid ${hide ? 'var(--acc)' : 'var(--line)'};background:${hide ? 'var(--acc)' : 'transparent'};color:var(--ink);display:flex;align-items:center;justify-content:center;font:800 12px var(--font-ui)`,
                )}
              >
                {hide ? '✓' : ''}
              </span>
              <Cover title={g.title} url={g.coverImageUrl} width={32} radius={6} />
              <span style={st('flex:1;min-width:0;font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
              <span style={st('font:500 12px var(--font-ui);color:var(--muted)')}>{hide ? t('add.sensitive.hide') : t('add.sensitive.keepVisible')}</span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
