import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { useUi } from '../context/UiContext';
import { Toggle } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const QUERY_KEY = ['auto-hide-adult'] as const;

/** The "Hide adult games automatically" setting: one query key and one server value behind every place it is shown
 * (Shelf settings, Libraries, onboarding), so changing it in one shows in the others straight away. */
export function useAutoHideAdult() {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: authApi.autoHideAdult });
  const mutation = useMutation({
    mutationFn: authApi.setAutoHideAdult,
    onSuccess: (res) => {
      queryClient.setQueryData(QUERY_KEY, res);
      // Turning it on hides the adult games already waiting, and scans the library for more.
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      ui.notify(res.enabled ? t('settings.shelf.autoHideAdult.on') : t('settings.shelf.autoHideAdult.off'));
    },
    onError: (err) => ui.showError(err instanceof Error ? err.message : t('settings.error.change')),
  });
  return { enabled: query.data?.enabled, loaded: !!query.data, pending: mutation.isPending, set: (on: boolean) => mutation.mutate(on) };
}

/** The setting as a row with a switch. */
export function AutoHideAdultRow() {
  const t = useT();
  const { enabled, loaded, pending, set } = useAutoHideAdult();
  return (
    <div style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:0 14px 0 16px;background:var(--surf)')}>
      <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
        <span style={st('font:600 15px var(--font-ui)')}>{t('settings.shelf.autoHideAdult.title')}</span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('settings.shelf.autoHideAdult.sub')}</span>
      </span>
      <Toggle on={enabled ?? false} disabled={!loaded || pending} onChange={set} label={t('settings.shelf.autoHideAdult.title')} />
    </div>
  );
}
