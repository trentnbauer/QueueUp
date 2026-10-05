import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import { Btn, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT, type MessageKey } from '../i18n';

const KINDS = ['alert_digest', 'confirm_email', 'address_changed', 'smtp_test'];

/** The emails the server tried to send, newest first (Administrator page): when, what kind, who it
 * went to, the subject, and whether it worked, with the mail server's reason when it did not. The
 * body is never stored, so it is never shown. */
export function AdminEmailLog(): ReactNode {
  const t = useT();
  const log = useQuery({ queryKey: ['admin', 'email-log'], queryFn: adminApi.emailLog });
  const entries = log.data?.entries ?? [];

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <div style={st('display:flex;align-items:center;justify-content:space-between;gap:8px')}>
        <Kicker>{t('pages.admin.emailLog')}</Kicker>
        <Btn kind="ghost" height={30} padX={10} fontSize={12.5} disabled={log.isFetching} onClick={() => void log.refetch()}>
          {t('pages.admin.emailLogRefresh')}
        </Btn>
      </div>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>{t('pages.admin.emailLogHint')}</span>
      {log.isError && <span style={st('font:400 13px var(--font-ui);color:var(--danger)')}>{t('pages.common.loadFailed')}</span>}
      {log.data && entries.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('pages.admin.emailLogEmpty')}</span>}
      {entries.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)')}>
          {entries.map((e) => (
            <div key={e.id} style={st('display:flex;flex-direction:column;gap:3px;padding:10px 14px;background:var(--surf)')}>
              <div style={st('display:flex;align-items:center;gap:8px;min-width:0')}>
                <span
                  style={st(`flex-shrink:0;font:700 10px var(--font-mono);letter-spacing:0.06em;padding:2px 7px;border-radius:999px;background:${e.status === 'sent' ? 'var(--mintSoft)' : 'var(--errBg)'};color:${e.status === 'sent' ? 'var(--mint)' : 'var(--danger)'}`)}
                >
                  {t(e.status === 'sent' ? 'pages.admin.emailLogSent' : 'pages.admin.emailLogFailed')}
                </span>
                <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{e.subject}</span>
                <span style={st('flex-shrink:0;font:400 12px var(--font-ui);color:var(--muted)')} title={new Date(e.createdAt).toLocaleString()}>
                  {formatRelativeTime(e.createdAt)}
                </span>
              </div>
              <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);overflow:hidden;text-overflow:ellipsis')}>
                {KINDS.includes(e.kind) ? t(`pages.admin.emailKind.${e.kind}` as MessageKey) : e.kind} · {e.to}
              </span>
              {e.error && <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--danger);word-break:break-word')}>{e.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
