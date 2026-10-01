import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS } from '@queueup/shared';
import { DISMISSED_IMPORTS_QUERY_KEY, PENDING_IMPORTS_QUERY_KEY, pendingImportsApi } from '../api/pendingImports';
import { useUi } from '../context/UiContext';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';

/** The two lists of synced titles that never became games, behind the shelf's "+" filters:
 * "Needs matching" (waiting for you to pick the right game) and "Dismissed" (you said no; restore
 * puts one back in the matching queue). */
export function PendingImportsList({ kind }: { kind: 'matching' | 'dismissed' }) {
  const ui = useUi();
  const queryClient = useQueryClient();
  const dismissed = kind === 'dismissed';
  const { data, isLoading } = useQuery({
    queryKey: dismissed ? DISMISSED_IMPORTS_QUERY_KEY : PENDING_IMPORTS_QUERY_KEY,
    queryFn: dismissed ? pendingImportsApi.listDismissed : pendingImportsApi.list,
  });
  const restore = useMutation({
    mutationFn: pendingImportsApi.restore,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY }),
    onError: () => ui.showError('Could not restore that title.'),
  });

  const rows = data?.pending ?? [];
  if (isLoading) return <div style={st('padding:36px 12px;text-align:center;font:500 14.5px var(--font-ui);color:var(--muted)')}>Loading…</div>;
  if (rows.length === 0) {
    return (
      <div style={st('padding:36px 12px;text-align:center;font:500 14.5px var(--font-ui);color:var(--muted)')}>
        {dismissed ? 'Nothing dismissed.' : 'Nothing is waiting for a match.'}
      </div>
    );
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:6px')}>
      {!dismissed && (
        <div style={st('display:flex;align-items:center;gap:12px;padding:0 4px 6px')}>
          <span style={st('flex:1;font:400 13px var(--font-ui);color:var(--muted)')}>Synced titles that couldn't be matched to a game automatically.</span>
          <Btn kind="accent" height={36} padX={14} fontSize={13} onClick={() => ui.openDialog('needsReview')}>
            Match them
          </Btn>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.id} style={st('display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:14px;background:var(--surf)')}>
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{r.title}</span>
            <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
              {[r.platforms.map((p) => ROOM_PLATFORM_LABELS[p]).join(', ') || 'Unknown platform', r.source].join(' · ')}
            </span>
          </span>
          {dismissed && (
            <Btn height={34} padX={14} fontSize={13} disabled={restore.isPending} onClick={() => restore.mutate(r.id)}>
              Restore
            </Btn>
          )}
        </div>
      ))}
    </div>
  );
}
