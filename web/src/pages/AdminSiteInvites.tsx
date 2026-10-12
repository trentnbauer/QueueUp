import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { siteInvitesApi, type SiteInvite } from '../api/siteInvites';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Btn, Collapsible, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { useT } from '../i18n';

/** Where an invite link lands: the sign-in page, which picks the code up from the query string. */
function inviteLink(code: string): string {
  return `${window.location.origin}${getBasePath()}/?invite=${encodeURIComponent(code)}`;
}

/** Administrator page: the sign-up mode, and the site invites that let people create an account
 * when SIGNUP_MODE=invite (#1096). */
export function AdminSiteInvites(): ReactNode {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'site-invites'], queryFn: siteInvitesApi.list });
  const [label, setLabel] = useState('');
  const [uses, setUses] = useState('');
  const [days, setDays] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'site-invites'] });
  const create = useMutation({
    mutationFn: () => siteInvitesApi.create({ label, maxUses: uses.trim() ? Number(uses) : null, expiresInDays: days.trim() ? Number(days) : null }),
    onSuccess: () => {
      setLabel('');
      setUses('');
      setDays('');
      void refresh();
    },
    onError: (err) => ui.showError(err instanceof Error ? err.message : String(err)),
  });

  async function revoke(i: SiteInvite) {
    if (!(await confirm({ title: t('pages.admin.invites.revokeTitle'), message: t('pages.admin.invites.revokeMessage'), confirmLabel: t('pages.admin.invites.revoke'), danger: true }))) return;
    try {
      await siteInvitesApi.revoke(i.id);
      void refresh();
    } catch (err) {
      ui.showError(err instanceof Error ? err.message : String(err));
    }
  }

  async function copy(i: SiteInvite) {
    await navigator.clipboard.writeText(inviteLink(i.code));
    ui.notify(t('pages.admin.invites.copied'));
  }

  function statusOf(i: SiteInvite): string {
    if (i.revokedAt) return t('pages.admin.invites.revoked');
    if (i.expiresAt && new Date(i.expiresAt) <= new Date()) return t('pages.admin.invites.expired');
    if (i.maxUses !== null && i.uses >= i.maxUses) return t('pages.admin.invites.usedUp');
    return t('pages.admin.invites.active');
  }

  const invites = q.data?.invites ?? [];
  return (
    <Collapsible title={t('pages.admin.invites.title')}>
      {q.data && <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>{t(q.data.signupMode === 'invite' ? 'pages.admin.invites.modeInvite' : 'pages.admin.invites.modeOpen')}</span>}
      {q.isError && <span style={st('font:400 13px var(--font-ui);color:var(--danger)')}>{t('pages.common.loadFailed')}</span>}
      <div style={st('display:flex;flex-direction:column;gap:8px')}>
        <input value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} placeholder={t('pages.admin.invites.label')} aria-label={t('pages.admin.invites.label')} style={st(inputPill)} />
        <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
          <input value={uses} inputMode="numeric" onChange={(e) => setUses(e.target.value.replace(/\D/g, ''))} placeholder={t('pages.admin.invites.uses')} aria-label={t('pages.admin.invites.uses')} style={st(`${inputPill};flex:1;min-width:140px`)} />
          <input value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} placeholder={t('pages.admin.invites.days')} aria-label={t('pages.admin.invites.days')} style={st(`${inputPill};flex:1;min-width:140px`)} />
        </div>
        <div>
          <Btn kind="soft" height={40} padX={16} disabled={create.isPending} onClick={() => create.mutate()}>
            {t('pages.admin.invites.create')}
          </Btn>
        </div>
      </div>
      {q.data && invites.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('pages.admin.invites.empty')}</span>}
      {invites.length > 0 && (
        <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)')}>
          {invites.map((i) => (
            <div key={i.id} style={st('display:flex;flex-direction:column;gap:4px;padding:10px 14px;background:var(--surf)')}>
              <div style={st('display:flex;align-items:center;gap:8px;min-width:0')}>
                <span style={st(`flex-shrink:0;font:700 10px var(--font-mono);letter-spacing:0.06em;padding:2px 7px;border-radius:999px;background:${i.active ? 'var(--mintSoft)' : 'var(--errBg)'};color:${i.active ? 'var(--mint)' : 'var(--danger)'}`)}>{statusOf(i)}</span>
                <code style={st('flex:1;min-width:0;font:600 13.5px var(--font-mono);overflow:hidden;text-overflow:ellipsis')}>{i.code}</code>
                <Btn kind="ghost" height={30} padX={10} fontSize={12.5} onClick={() => void copy(i)}>
                  {t('pages.admin.invites.copy')}
                </Btn>
                {!i.revokedAt && (
                  <Btn kind="ghost" height={30} padX={10} fontSize={12.5} onClick={() => void revoke(i)}>
                    {t('pages.admin.invites.revoke')}
                  </Btn>
                )}
              </div>
              <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
                {[i.label, i.maxUses !== null ? t('pages.admin.invites.usedOf', { used: i.uses, max: i.maxUses }) : t('pages.admin.invites.used', { used: i.uses }), i.expiresAt ? t('pages.admin.invites.expires', { when: new Date(i.expiresAt).toLocaleDateString() }) : '']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </Collapsible>
  );
}
