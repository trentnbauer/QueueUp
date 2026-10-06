import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MERGED_GAMES_QUERY_KEY, gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { useAiActivity } from '../hooks/useAiActivity';
import { Btn, Spinner } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Games merged into another (issue #814), behind the shelf's "+" filters. The merged card is gone;
 * what's kept is the redirect, so a later import of the old game lands on the one it was merged
 * into. "Stop merging" removes that redirect only - it doesn't bring the card back. */
export function MergedGamesList() {
  const ui = useUi();
  const t = useT();
  const scanning = useAiActivity('duplicates');
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: MERGED_GAMES_QUERY_KEY, queryFn: gamesApi.mergedList });
  const forget = useMutation({
    mutationFn: gamesApi.forgetMerged,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: MERGED_GAMES_QUERY_KEY }),
    onError: () => ui.showError(t('home.merged.failed')),
  });

  const rows = data?.merged ?? [];
  // Runs the AI duplicate finder (DuplicatesDialog) over the shelf and offers to merge what it
  // finds; each merge then shows up in the list below.
  const findDuplicates = (
    <div style={st('display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:14px;background:var(--surf)')}>
      <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={st('font:600 14.5px var(--font-ui)')}>{t('home.merged.find')}</span>
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('settings.me.duplicates.sub')}</span>
      </span>
      <Btn kind="soft" height={34} padX={14} fontSize={13} onClick={() => ui.openDialog('duplicates')}>
        {scanning ? (
          <span style={st('display:inline-flex;align-items:center;gap:8px')}>
            <Spinner />
            {t('settings.duplicates.scanning')}
          </span>
        ) : (
          t('home.merged.findBtn')
        )}
      </Btn>
    </div>
  );
  if (isLoading) return <div style={st('padding:36px 12px;text-align:center;font:500 14.5px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</div>;
  if (rows.length === 0) {
    return (
      <div style={st('display:flex;flex-direction:column;gap:6px')}>
        {findDuplicates}
        <div style={st('padding:36px 12px;text-align:center;font:500 14.5px var(--font-ui);color:var(--muted)')}>{t('home.merged.none')}</div>
      </div>
    );
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:6px')}>
      {findDuplicates}
      <div style={st('padding:8px 4px 6px;font:400 13px var(--font-ui);color:var(--muted)')}>{t('home.merged.intro')}</div>
      {rows.map((r) => (
        <div key={r.fromIgdbId} style={st('display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:14px;background:var(--surf)')}>
          <span
            style={{
              width: 30,
              height: 40,
              flexShrink: 0,
              borderRadius: 4,
              background: r.fromCoverImageUrl ? `url("${r.fromCoverImageUrl}") center/cover no-repeat` : 'var(--surf2)',
            }}
          />
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{r.fromTitle}</span>
            <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
              {'→ '}
              {r.toTitle}
            </span>
          </span>
          <Btn height={34} padX={14} fontSize={13} disabled={forget.isPending} onClick={() => forget.mutate(r.fromIgdbId)}>
            {t('home.merged.forget')}
          </Btn>
        </div>
      ))}
    </div>
  );
}
