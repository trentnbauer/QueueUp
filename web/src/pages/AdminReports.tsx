import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moderationApi } from '../api/moderation';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn, Collapsible } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT } from '../i18n';

const ROW = 'display:flex;flex-direction:column;gap:6px;padding:12px 14px;background:var(--surf)';
const LIST = 'display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)';
const HEADING = 'font:700 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)';

/** Moderation (Administrator page): open reports about people, who is banned, and banned people's
 * requests to be unbanned. A report's person can be banned from right there; resolving a report,
 * banning and unbanning are all recorded in the audit log. */
export function AdminReports(): ReactNode {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const reports = useQuery({ queryKey: ['admin', 'reports'], queryFn: moderationApi.adminReports });
  const bans = useQuery({ queryKey: ['admin', 'bans'], queryFn: moderationApi.adminBans });
  const [banning, setBanning] = useState<{ id: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState('');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'bans'] });
  };
  const onError = (e: unknown) => ui.notify(e instanceof Error ? e.message : t('social.ban.admin.failed'));

  const resolve = useMutation({ mutationFn: moderationApi.resolveReport, onSuccess: refresh, onError });
  const unban = useMutation({
    mutationFn: (b: { userId: string; name: string }) => moderationApi.unban(b.userId),
    onSuccess: (_r, b) => {
      refresh();
      ui.notify(t('social.ban.admin.unbanned', { name: b.name }));
    },
    onError,
  });
  const ban = useMutation({
    mutationFn: (b: { id: string; name: string; reason: string }) => moderationApi.ban(b.id, b.reason),
    onSuccess: (_r, b) => {
      refresh();
      setBanning(null);
      setBanReason('');
      ui.notify(t('social.ban.admin.done', { name: b.name }));
    },
    onError,
  });
  const decline = useMutation({ mutationFn: moderationApi.declineUnban, onSuccess: refresh, onError });

  const rows = reports.data?.reports ?? [];
  const banned = bans.data?.bans ?? [];
  const requests = bans.data?.unbanRequests ?? [];
  const open = rows.length + requests.length;

  return (
    <Collapsible title={`${t('social.reports.title')}${open > 0 ? ` (${open})` : ''}`}>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.reports.hint')}</span>

      {requests.length > 0 && (
        <>
          <span style={st(HEADING)}>{t('social.ban.admin.requestsHeading')}</span>
          <div style={st(LIST)}>
            {requests.map((r) => (
              <div key={r.id} style={st(ROW)}>
                <div style={st('display:flex;align-items:center;gap:8px')}>
                  <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);overflow-wrap:anywhere')}>{r.displayName}</span>
                  <span style={st('flex-shrink:0;font:400 12px var(--font-ui);color:var(--muted)')}>{formatRelativeTime(r.createdAt)}</span>
                </div>
                <span style={st('font:400 13.5px/1.5 var(--font-ui);white-space:pre-wrap;overflow-wrap:anywhere')}>{r.message}</span>
                <div style={st('display:flex;gap:8px')}>
                  <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={unban.isPending} onClick={() => unban.mutate({ userId: r.userId, name: r.displayName })}>
                    {t('social.ban.admin.unban')}
                  </Btn>
                  <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={decline.isPending} onClick={() => decline.mutate(r.id)}>
                    {t('social.ban.admin.decline')}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {reports.data && rows.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('social.reports.empty')}</span>}
      {rows.length > 0 && (
        <div style={st(LIST)}>
          {rows.map((r) => (
            <div key={r.id} style={st(ROW)}>
              <div style={st('display:flex;align-items:center;gap:8px')}>
                <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);overflow-wrap:anywhere')}>
                  {t('social.reports.line', { reporter: r.reporter.displayName, reported: r.reported.displayName })}
                </span>
                <span style={st('flex-shrink:0;font:400 12px var(--font-ui);color:var(--muted)')} title={new Date(r.createdAt).toLocaleString()}>
                  {formatRelativeTime(r.createdAt)}
                </span>
              </div>
              <span style={st('font:400 13.5px/1.5 var(--font-ui);white-space:pre-wrap;overflow-wrap:anywhere')}>{r.reason}</span>
              <div style={st('display:flex;align-items:center;gap:8px')}>
                <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={resolve.isPending} onClick={() => resolve.mutate(r.id)}>
                  {t('social.reports.resolve')}
                </Btn>
                {r.reportedBanned ? (
                  <>
                    <span style={st('font:700 10px var(--font-mono);letter-spacing:0.06em;padding:2px 7px;border-radius:999px;background:var(--errBg);color:var(--danger)')}>{t('social.ban.admin.banned')}</span>
                    <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={unban.isPending} onClick={() => unban.mutate({ userId: r.reported.id, name: r.reported.displayName })}>
                      {t('social.ban.admin.unban')}
                    </Btn>
                  </>
                ) : (
                  <Btn kind="danger" height={32} padX={12} fontSize={12.5} onClick={() => setBanning({ id: r.reported.id, name: r.reported.displayName })}>
                    {t('social.ban.admin.action')}
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {banned.length > 0 && (
        <>
          <span style={st(HEADING)}>{t('social.ban.admin.heading')}</span>
          <div style={st(LIST)}>
            {banned.map((b) => (
              <div key={b.userId} style={st(ROW)}>
                <div style={st('display:flex;align-items:center;gap:8px')}>
                  <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);overflow-wrap:anywhere')}>
                    {t('social.ban.admin.since', { name: b.displayName, when: formatRelativeTime(b.bannedAt) })}
                  </span>
                  <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={unban.isPending} onClick={() => unban.mutate({ userId: b.userId, name: b.displayName })}>
                    {t('social.ban.admin.unban')}
                  </Btn>
                </div>
                {b.reason && <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted);overflow-wrap:anywhere')}>{b.reason}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {banning && (
        <Dialog title={t('social.ban.admin.title', { name: banning.name })} onClose={() => setBanning(null)} width={440}>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.ban.admin.message')}</span>
          <textarea
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('social.ban.admin.reasonPlaceholder')}
            aria-label={t('social.ban.admin.reasonPlaceholder')}
            style={st('width:100%;box-sizing:border-box;resize:vertical;padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--surf);color:var(--text);font:400 14.5px/1.55 var(--font-ui)')}
          />
          <div style={st('display:flex;gap:8px')}>
            <Btn kind="danger" height={40} padX={18} disabled={ban.isPending} onClick={() => ban.mutate({ ...banning, reason: banReason })}>
              {t('social.ban.admin.confirm')}
            </Btn>
            <Btn kind="ghost" height={40} padX={14} disabled={ban.isPending} onClick={() => setBanning(null)}>
              {t('common.cancel')}
            </Btn>
          </div>
        </Dialog>
      )}
    </Collapsible>
  );
}
