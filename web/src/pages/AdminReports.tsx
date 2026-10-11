import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moderationApi } from '../api/moderation';
import { useUi } from '../context/UiContext';
import { Btn, Collapsible } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT } from '../i18n';

/** Open reports about people (Administrator page): who reported whom, when, and what the reporter
 * wrote. Marking one resolved takes it off the list and is recorded in the audit log. */
export function AdminReports(): ReactNode {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const reports = useQuery({ queryKey: ['admin', 'reports'], queryFn: moderationApi.adminReports });
  const resolve = useMutation({
    mutationFn: moderationApi.resolveReport,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] }),
    onError: (e) => ui.notify(e instanceof Error ? e.message : t('social.reports.resolveFailed')),
  });
  const rows = reports.data?.reports ?? [];

  return (
    <Collapsible title={`${t('social.reports.title')}${rows.length > 0 ? ` (${rows.length})` : ''}`}>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.reports.hint')}</span>
      {reports.data && rows.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('social.reports.empty')}</span>}
      {rows.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)')}>
          {rows.map((r) => (
            <div key={r.id} style={st('display:flex;flex-direction:column;gap:6px;padding:12px 14px;background:var(--surf)')}>
              <div style={st('display:flex;align-items:center;gap:8px')}>
                <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);overflow-wrap:anywhere')}>
                  {t('social.reports.line', { reporter: r.reporter.displayName, reported: r.reported.displayName })}
                </span>
                <span style={st('flex-shrink:0;font:400 12px var(--font-ui);color:var(--muted)')} title={new Date(r.createdAt).toLocaleString()}>
                  {formatRelativeTime(r.createdAt)}
                </span>
              </div>
              <span style={st('font:400 13.5px/1.5 var(--font-ui);white-space:pre-wrap;overflow-wrap:anywhere')}>{r.reason}</span>
              <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={resolve.isPending} onClick={() => resolve.mutate(r.id)}>
                {t('social.reports.resolve')}
              </Btn>
            </div>
          ))}
        </div>
      )}
    </Collapsible>
  );
}
