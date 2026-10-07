import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, SPIN_WHEEL_THEMES, sortPlatforms } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { ColourPicker } from '../ui/ColourPicker';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn, ChipToggle, Group, Kicker, Toggle } from '../ui/primitives';
import { st } from '../ui/st';
import { exportGames } from '../utils/exportGames';
import { BACKLOG_SORT_OPTIONS, toggleBacklogSort, useBacklogSort } from '../home/backlogSort';
import { formatRelativeTime } from '../utils/relativeTime';
import { useShelfSpinTheme } from '../home/shelfSpinTheme';
import { NavRow, SystemsDialog } from './MeDialog';
import { rich, useT } from '../i18n';
import { spinThemeHint, spinThemeLabel } from '../i18n/labels';

/** The shelf's Spin type: the reel or one of the spin modes, or a random one each time. */
function ShelfSpinTypeDialog({ onClose }: { onClose: () => void }) {
  const ui = useUi();
  const t = useT();
  const [theme, setTheme] = useShelfSpinTheme();
  return (
    <Dialog onClose={onClose} title={t('settings.shelf.spinType')} gap={12}>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{spinThemeHint(theme)}</span>
      <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
        {SPIN_WHEEL_THEMES.map((th) => (
          <ChipToggle
            key={th}
            on={theme === th}
            onClick={() => {
              setTheme(th);
              ui.notify(t('settings.shelf.spinType.toast', { theme: spinThemeLabel(th) }));
            }}
          >
            {th === 'random' ? t('settings.shelf.spinType.random') : spinThemeLabel(th)}
          </ChipToggle>
        ))}
      </div>
    </Dialog>
  );
}

export function ShelfSettingsDialog() {
  const ui = useUi();
  const t = useT();
  const { games } = useScope();
  const [showAct, setShowAct] = useState(false);
  const activity = useInfiniteQuery({
    queryKey: ['shelf-activity'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => gamesApi.activity(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: showAct,
  });
  const entries = activity.data?.pages.flatMap((p) => p.entries) ?? [];
  const [backlogSort, setBacklogSort] = useBacklogSort();
  const { ownedPlatforms, shelfColor, refetch } = useAuth();
  const saveColour = async (colour: string | null) => {
    try {
      await authApi.setShelfColor(colour);
      await refetch();
      ui.notify(t('settings.shelfColour.saved'));
    } catch (e) {
      ui.showError(e instanceof Error ? e.message : t('settings.shelfColour.failed'));
    }
  };
  const queryClient = useQueryClient();
  const autoHide = useQuery({ queryKey: ['auto-hide-adult'], queryFn: authApi.autoHideAdult });
  const setAutoHide = useMutation({
    mutationFn: authApi.setAutoHideAdult,
    onSuccess: (res) => {
      queryClient.setQueryData(['auto-hide-adult'], res);
      // Turning it on hides the adult games already waiting.
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      ui.notify(res.enabled ? t('settings.shelf.autoHideAdult.on') : t('settings.shelf.autoHideAdult.off'));
    },
    onError: (err) => ui.showError(err instanceof Error ? err.message : t('settings.error.change')),
  });
  const [spinTheme] = useShelfSpinTheme();
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [spinOpen, setSpinOpen] = useState(false);

  return (
    <>
    <Dialog onClose={() => ui.closeDialog('shelfSettings')} title={t('settings.shelf.title')} gap={24}>
      <Group>
        <NavRow
          label={t('settings.systems.title')}
          sub={ownedPlatforms.length === 0 ? t('settings.systems.everyPlatform') : sortPlatforms(ownedPlatforms).map((p) => ROOM_PLATFORM_LABELS[p]).join(', ')}
          onClick={() => setSystemsOpen(true)}
        />
        <div style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:0 14px 0 16px;background:var(--surf)')}>
          <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
            <span style={st('font:600 15px var(--font-ui)')}>{t('settings.shelf.autoHideAdult.title')}</span>
            <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('settings.shelf.autoHideAdult.sub')}</span>
          </span>
          <Toggle on={autoHide.data?.enabled ?? false} disabled={!autoHide.data || setAutoHide.isPending} onChange={(on) => setAutoHide.mutate(on)} label={t('settings.shelf.autoHideAdult.title')} />
        </div>
        <NavRow label={t('settings.shelf.spinType')} sub={spinThemeLabel(spinTheme)} onClick={() => setSpinOpen(true)} />
        <NavRow
          label={t('settings.shelf.merge')}
          sub={t('settings.shelf.merge.sub')}
          onClick={() => {
            ui.closeDialog('shelfSettings');
            ui.openDialog('duplicates');
          }}
        />
      </Group>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('settings.shelfColour.title')}</Kicker>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.shelfColour.hint')}</span>
        <ColourPicker value={shelfColor} onChange={(c) => void saveColour(c)} allowClear label={t('settings.shelfColour.title')} />
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('settings.shelf.sortBy')}</Kicker>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.shelf.sortHint')}</span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          {BACKLOG_SORT_OPTIONS.map((o) => {
            const rank = backlogSort.indexOf(o.key) + 1;
            return (
              <ChipToggle key={o.key} on={rank > 0} height={36} onClick={() => setBacklogSort(toggleBacklogSort(backlogSort, o.key))}>
                {backlogSort.length > 1 && rank > 0 && (
                  <span aria-label={t('settings.shelf.priority', { n: rank })} style={st('margin-right:6px;font:700 11px var(--font-mono);opacity:0.7')}>{rank}</span>
                )}
                {o.label}
              </ChipToggle>
            );
          })}
        </div>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('settings.shelf.export', { n: games.length })}</Kicker>
        <div style={st('display:flex;gap:8px')}>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'csv', 'personal-shelf')}>{t('settings.shelf.exportCsv')}</Btn>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'json', 'personal-shelf')}>{t('settings.shelf.exportJson')}</Btn>
        </div>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>{t('settings.shelf.activity')}</Kicker>
        {!showAct ? (
          <Btn height={40} fontSize={13} style={{ alignSelf: 'flex-start' }} onClick={() => setShowAct(true)}>
            {t('settings.shelf.showActivity')}
          </Btn>
        ) : (
          <>
            {activity.isLoading && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>}
            {!activity.isLoading && entries.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('settings.shelf.activityEmpty')}</span>}
            {entries.map((a) => (
              <div key={a.id} style={st('display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--chip);font:400 13.5px var(--font-ui)')}>
                <span>{a.message}</span>
                <span style={st('flex-shrink:0;color:var(--faint);font-size:12px')}>{formatRelativeTime(a.createdAt)}</span>
              </div>
            ))}
            {activity.hasNextPage && (
              <Btn height={36} fontSize={13} style={{ alignSelf: 'flex-start' }} disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
                {activity.isFetchingNextPage ? t('common.loading') : t('settings.loadMore')}
              </Btn>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          ui.closeDialog('shelfSettings');
          ui.openDialog('me');
        }}
        style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:400 13px/1.5 var(--font-ui);text-align:left')}
      >
        {rich(t('settings.shelf.profileHint'), {
          link: <span style={st('color:var(--accText);text-decoration:underline;text-underline-offset:3px')}>{t('settings.shelf.profileLink')}</span>,
        })}
      </button>
    </Dialog>
    {systemsOpen && <SystemsDialog onClose={() => setSystemsOpen(false)} />}
    {spinOpen && <ShelfSpinTypeDialog onClose={() => setSpinOpen(false)} />}
    </>
  );
}
