import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, type AdminIntegrationStatus, type ConfigSource, type IntegrationConfigKey, type TunnelState } from '@queueup/shared';
import { adminApi } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Avatar, Banner, Btn, Collapsible, Group } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { AdminAiSection } from './AdminAiSection';
import { AdminBackups } from './AdminBackups';
import { AdminEmailLog } from './AdminEmailLog';
import { AdminRoomView } from './AdminRoomView';
import { PageShell } from './PageShell';
import { rich, t as tr, useT, type MessageKey } from '../i18n';

function fields(s: AdminIntegrationStatus): { key: IntegrationConfigKey; label: string; source: ConfigSource }[] {
  return [
    { key: 'GGDEALS_API_KEY', label: tr('pages.admin.field.ggdeals'), source: s.ggDealsApiKeySource },
    { key: 'IGDB_CLIENT_ID', label: tr('pages.admin.field.igdbId'), source: s.igdbClientIdSource },
    { key: 'IGDB_CLIENT_SECRET', label: tr('pages.admin.field.igdbSecret'), source: s.igdbClientSecretSource },
    { key: 'SCANDEX_API_KEY', label: tr('pages.admin.field.scandex'), source: s.scandexApiKeySource },
    { key: 'XBOX_CLIENT_ID', label: tr('pages.admin.field.xbox'), source: s.xboxClientIdSource },
    { key: 'TURNSTILE_SITE_KEY', label: tr('pages.admin.field.turnstileSite'), source: s.turnstileSiteKeySource },
    { key: 'TURNSTILE_SECRET_KEY', label: tr('pages.admin.field.turnstileSecret'), source: s.turnstileSecretKeySource },
    { key: 'GA_MEASUREMENT_ID', label: tr('pages.admin.field.ga'), source: s.gaMeasurementIdSource },
  ];
}

function smtpFields(s: AdminIntegrationStatus): { key: IntegrationConfigKey; label: string; source: ConfigSource; plain?: boolean }[] {
  return [
    { key: 'SMTP_HOST', label: tr('pages.admin.field.smtpHost'), source: s.smtpSources.SMTP_HOST, plain: true },
    { key: 'SMTP_PORT', label: tr('pages.admin.field.smtpPort'), source: s.smtpSources.SMTP_PORT, plain: true },
    { key: 'SMTP_USER', label: tr('pages.admin.field.smtpUser'), source: s.smtpSources.SMTP_USER, plain: true },
    { key: 'SMTP_PASSWORD', label: tr('pages.admin.field.smtpPassword'), source: s.smtpSources.SMTP_PASSWORD },
    { key: 'SMTP_FROM', label: tr('pages.admin.field.smtpFrom'), source: s.smtpSources.SMTP_FROM, plain: true },
  ];
}

/** The container's own port (PORT), which the tunnel's public hostname should point at. */
/** A token count in short form (12.3K, 1.2M) in the reader's locale. */
const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const TUNNEL_PORT_HINT = 3000;

/** Colour per tunnel state; the label is `pages.admin.tunnel.<state>`. */
const TUNNEL_STATE: Record<TunnelState, { color: string }> = {
  off: { color: 'var(--muted)' },
  starting: { color: 'var(--text2)' },
  connected: { color: 'var(--mint)' },
  error: { color: 'var(--danger)' },
  unavailable: { color: 'var(--danger)' },
};

const PILL = 'height:30px;padding:0 12px;border-radius:999px;background:var(--surf);display:flex;align-items:center;gap:6px;font:500 12.5px var(--font-ui)';

/** Administrator settings: integration keys, rooms and users on this server. */
export function AdminPage() {
  const { user } = useAuth();
  const t = useT();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const ui = useUi();
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const navigate = useNavigate();
  const go = (path: string) => () => navigate(path);

  const enabled = !!user?.isAdmin;
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminApi.overview,
    enabled,
    // While the tunnel is coming up or retrying, keep its status fresh.
    refetchInterval: (q) => (q.state.data?.tunnel.state === 'starting' || q.state.data?.tunnel.state === 'error' ? 3000 : false),
  });
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: adminApi.users, enabled });
  const rooms = useQuery({ queryKey: ['admin', 'rooms'], queryFn: adminApi.rooms, enabled });

  if (!user) return null;
  if (!user.isAdmin) {
    return (
      <PageShell title={t('pages.admin.title')}>
        <span style={st('color:var(--muted)')}>{t('pages.admin.noAccess')}</span>
      </PageShell>
    );
  }

  const fail = (e: unknown, fallback: string) => setError(e instanceof Error ? e.message : fallback);
  const status = overview.data?.status;
  const tunnel = overview.data?.tunnel;

  async function save(key: IntegrationConfigKey) {
    const value = (inputs[key] ?? '').trim();
    if (!value) return;
    setBusyKey(key);
    try {
      await adminApi.setIntegrationConfig(key, value);
      setInputs((p) => ({ ...p, [key]: '' }));
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
      ui.notify(t('pages.admin.saved'));
    } catch (e) {
      fail(e, t('pages.admin.saveFailed'));
    } finally {
      setBusyKey(null);
    }
  }

  async function clear(key: IntegrationConfigKey, label: string) {
    const ok = await confirm({
      title: t('pages.admin.clearTitle', { label }),
      message: t('pages.admin.clearMessage'),
      confirmLabel: t('pages.admin.clear'),
      danger: true,
    });
    if (!ok) return;
    setBusyKey(key);
    try {
      await adminApi.clearIntegrationConfig(key);
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    } catch (e) {
      fail(e, t('pages.admin.clearFailed'));
    } finally {
      setBusyKey(null);
    }
  }

  /** #792: act as the room's Room Master for an hour, without joining it. */
  async function manageRoom(id: string, name: string) {
    const ok = await confirm({
      title: t('pages.admin.manageTitle', { name }),
      message: t('pages.admin.manageMessage'),
      confirmLabel: t('pages.admin.manageConfirm'),
    });
    if (!ok) return;
    try {
      await adminApi.manageRoom(id);
      qc.invalidateQueries({ queryKey: ['admin', 'rooms'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      ui.notify(t('pages.admin.managing', { name }));
    } catch (e) {
      fail(e, t('pages.admin.manageFailed'));
    }
  }

  async function stopManaging(id: string) {
    try {
      await adminApi.stopManagingRoom(id);
      qc.invalidateQueries({ queryKey: ['admin', 'rooms'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    } catch (e) {
      fail(e, t('pages.admin.stopFailed'));
    }
  }

  async function deleteRoom(id: string, name: string) {
    const ok = await confirm({ title: t('pages.admin.deleteTitle', { name }), message: t('pages.admin.deleteRoomMessage'), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await adminApi.deleteRoom(id);
      qc.invalidateQueries({ queryKey: ['admin', 'rooms'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    } catch (e) {
      fail(e, t('pages.admin.deleteRoomFailed'));
    }
  }

  async function deleteUser(id: string, name: string) {
    const ok = await confirm({
      title: t('pages.admin.deleteTitle', { name }),
      message: t('pages.admin.deleteUserMessage'),
      confirmLabel: t('common.delete'),
      danger: true,
      typedConfirmation: 'DELETE',
    });
    if (!ok) return;
    try {
      await adminApi.deleteUser(id);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (e) {
      fail(e, t('pages.admin.deleteUserFailed'));
    }
  }

  async function setAdmin(id: string, isAdmin: boolean) {
    try {
      await adminApi.setUserAdmin(id, isAdmin);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (e) {
      fail(e, t('pages.admin.roleFailed'));
    }
  }

  async function setAiAccess(id: string, aiEntitled: boolean) {
    try {
      await adminApi.setUserAiAccess(id, aiEntitled);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (e) {
      fail(e, t('pages.admin.aiAccessFailed'));
    }
  }

  async function sendTest() {
    setBusyKey('smtp-test');
    try {
      const res = await adminApi.sendTestEmail();
      ui.notify(t('pages.admin.testSent', { email: res.sentTo }));
    } catch (e) {
      fail(e, t('pages.admin.testFailed'));
    } finally {
      setBusyKey(null);
    }
  }

  const keyRow = (f: { key: IntegrationConfigKey; label: string; source: ConfigSource; plain?: boolean }) => (
              <div key={f.key} style={st('display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:var(--surf)')}>
                <div style={st('display:flex;align-items:center;gap:10px')}>
                  <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                    <span style={st('font:600 14.5px var(--font-ui)')}>{f.label}</span>
                    <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>
                      {f.source === 'env' ? t('pages.admin.source.env') : f.source === 'db' ? t('pages.admin.source.db') : t('pages.admin.source.none')}
                    </span>
                  </span>
                  {f.source === 'env' && <span style={st('font:600 12px var(--font-ui);color:var(--mint)')}>{t('pages.admin.configured')}</span>}
                </div>
                {f.source !== 'env' && (
                  <div style={st('display:flex;gap:6px')}>
                    <input
                      type={f.plain ? 'text' : 'password'}
                      autoComplete="off"
                      value={inputs[f.key] ?? ''}
                      onChange={(e) => setInputs((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.source === 'db' ? t('pages.admin.replacePlaceholder') : t('pages.admin.valuePlaceholder')}
                      aria-label={f.label}
                      style={st('flex:1;min-width:0;height:40px;padding:0 12px;border-radius:12px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-size:14px;outline:none')}
                    />
                    <Btn kind="text" height={40} padX={14} fontSize={12.5} weight={700} disabled={busyKey === f.key || !(inputs[f.key] ?? '').trim()} onClick={() => save(f.key)}>
                      {t('common.save')}
                    </Btn>
                    {f.source === 'db' && (
                      <Btn kind="ghost" height={40} padX={10} fontSize={12.5} style={{ color: 'var(--danger)' }} disabled={busyKey === f.key} onClick={() => clear(f.key, f.label)}>
                        {t('pages.admin.clear')}
                      </Btn>
                    )}
                  </div>
                )}
              </div>
  );

  return (
    <PageShell title={t('pages.admin.title')} hint={t('pages.admin.hint')}>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {status && (
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          <span style={st(PILL)}>gg.deals <span style={st(`color:${status.ggDealsApiKeyConfigured ? 'var(--mint)' : 'var(--danger)'};font-weight:600`)}>{status.ggDealsApiKeyConfigured ? t('pages.admin.configured') : t('pages.admin.missing')}</span></span>
          <span style={st(PILL)}>IGDB <span style={st(`color:${status.igdbConfigured ? 'var(--mint)' : 'var(--danger)'};font-weight:600`)}>{status.igdbConfigured ? t('pages.admin.configured') : t('pages.admin.missing')}</span></span>
          {status.devFakeAuth ? (
            <span style={st(PILL)}>{t('pages.admin.signIn')} <span style={st('color:var(--danger);font-weight:600')}>{t('pages.admin.devFakeAuth')}</span></span>
          ) : status.activeAuthProviders.length ? (
            status.activeAuthProviders.map((p) => (
              <span key={p} style={st(PILL)}>{t('pages.admin.signIn')} <span style={st('color:var(--mint);font-weight:600')}>{p}</span></span>
            ))
          ) : (
            <span style={st(PILL)}>{t('pages.admin.signIn')} <span style={st('color:var(--danger);font-weight:600')}>{t('pages.admin.noneConfigured')}</span></span>
          )}
        </div>
      )}

      {status && (
        <Collapsible title={t('pages.admin.integrationKeys')}>
          <Group>
            {fields(status).map(keyRow)}
          </Group>
        </Collapsible>
      )}

      <AdminAiSection />

      {status && (
        <Collapsible title={t('pages.admin.emailAlerts')}>
          <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>
            {t('pages.admin.emailHint')}
          </span>
          <Group>{smtpFields(status).map(keyRow)}</Group>
          <div style={st('display:flex;align-items:center;gap:10px')}>
            <Btn kind="soft" height={40} padX={16} disabled={!status.smtpConfigured || busyKey === 'smtp-test'} onClick={sendTest}>
              {busyKey === 'smtp-test' ? t('pages.admin.sending') : t('pages.admin.sendTest')}
            </Btn>
            {!status.smtpConfigured && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('pages.admin.smtpFirst')}</span>}
          </div>
        </Collapsible>
      )}

      <AdminEmailLog />

      {tunnel && (
        <Collapsible title={t('pages.admin.tunnelKicker')}>
          <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>
            {rich(t('pages.admin.tunnelHint'), { url: <code>http://localhost:{TUNNEL_PORT_HINT}</code> })}
          </span>
          <Group>
            <div style={st('display:flex;align-items:center;gap:10px;min-height:52px;padding:10px 14px;background:var(--surf)')}>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{t('pages.admin.status')}</span>
                {tunnel.lastError && tunnel.state !== 'connected' && (
                  <span style={st('font:400 12px var(--font-ui);color:var(--danger);overflow-wrap:anywhere')}>{tunnel.lastError}</span>
                )}
              </span>
              <span style={st(`font:600 12.5px var(--font-ui);color:${TUNNEL_STATE[tunnel.state].color}`)}>
                {tunnel.state === 'connected'
                  ? t(tunnel.connections === 1 ? 'pages.admin.tunnel.connections.one' : 'pages.admin.tunnel.connections.other', { state: t('pages.admin.tunnel.connected'), n: tunnel.connections })
                  : t(`pages.admin.tunnel.${tunnel.state}` as MessageKey)}
              </span>
            </div>
            {keyRow({ key: 'CLOUDFLARE_TUNNEL_TOKEN', label: t('pages.admin.field.tunnelToken'), source: tunnel.source })}
          </Group>
        </Collapsible>
      )}

      <Collapsible title={t('pages.admin.rooms', { n: rooms.data?.rooms.length ?? 0 })}>
        <Group>
          {rooms.data?.rooms.map((r) => (
            <Fragment key={r.id}>
            <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-height:60px;padding:8px 10px 8px 16px;background:var(--surf)')}>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{r.name}</span>
                <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>
                  {r.platform ? ROOM_PLATFORM_LABELS[r.platform] : t('pages.admin.anyPlatform')} · {t('pages.admin.by', { name: r.creatorDisplayName })} ·{' '}
                  {t(r.memberCount === 1 ? 'pages.admin.members.one' : 'pages.admin.members.other', { n: r.memberCount })} ·{' '}
                  {t(r.gameCount === 1 ? 'pages.admin.games.one' : 'pages.admin.games.other', { n: r.gameCount })}
                </span>
                {r.managingUntil && (
                  <span style={st('font:500 12px var(--font-ui);color:var(--accText)')}>
                    {t('pages.admin.managingUntil', { time: new Date(r.managingUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })}
                  </span>
                )}
              </span>
              <Btn kind="ghost" height={32} padX={12} fontSize={12.5} onClick={() => setOpenRoom(openRoom === r.id ? null : r.id)} aria-expanded={openRoom === r.id}>
                {openRoom === r.id ? t('pages.admin.hide') : t('common.view')}
              </Btn>
              {r.managingUntil ? (
                <>
                  <Btn kind="soft" height={32} padX={12} fontSize={12.5} onClick={go(`/room/${r.id}`)}>
                    {t('pages.admin.open')}
                  </Btn>
                  <Btn kind="ghost" height={32} padX={12} fontSize={12.5} onClick={() => stopManaging(r.id)}>
                    {t('pages.admin.stopManaging')}
                  </Btn>
                </>
              ) : (
                <Btn kind="ghost" height={32} padX={12} fontSize={12.5} onClick={() => manageRoom(r.id, r.name)}>
                  {t('pages.admin.manage')}
                </Btn>
              )}
              <Btn kind="ghost" height={32} padX={12} fontSize={12.5} style={{ color: 'var(--danger)' }} onClick={() => deleteRoom(r.id, r.name)}>
                {t('common.delete')}
              </Btn>
            </div>
            {openRoom === r.id && <AdminRoomView roomId={r.id} />}
            </Fragment>
          ))}
          {rooms.data?.rooms.length === 0 && <div style={st('padding:16px;background:var(--surf);color:var(--muted);font-size:14px')}>{t('pages.admin.noRooms')}</div>}
        </Group>
      </Collapsible>

      <Collapsible title={t('pages.admin.users', { n: users.data?.users.length ?? 0 })}>
        <Group>
          {users.data?.users.map((u) => {
            const me = u.id === user.id;
            return (
              <div key={u.id} style={st('display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 16px;background:var(--surf)')}>
                <Avatar name={u.displayName} color={u.avatarColor} avatarUrl={null} size={30} fontSize={12} />
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                  <span style={st('font:600 14.5px var(--font-ui)')}>{u.displayName}</span>
                  <span style={st('font:400 12px var(--font-ui);color:var(--muted);overflow:hidden;text-overflow:ellipsis')}>{u.email}</span>
                  {(u.serverAi.requestsThisMonth > 0 || u.serverAi.avgTokensPerMonth !== null) && (
                    <span title={t('pages.admin.serverAiHint')} style={st('font:400 12px var(--font-ui);color:var(--faint)')}>
                      {u.serverAi.avgTokensPerMonth === null
                        ? t('pages.admin.serverAiNoAvg', { tokens: compact(u.serverAi.tokensThisMonth), requests: u.serverAi.requestsThisMonth })
                        : t('pages.admin.serverAi', { tokens: compact(u.serverAi.tokensThisMonth), requests: u.serverAi.requestsThisMonth, avg: compact(u.serverAi.avgTokensPerMonth) })}
                    </span>
                  )}
                </span>
                {!u.isAdmin && (
                  <select
                    value={u.aiEntitled ? 'on' : 'off'}
                    aria-label={t('pages.admin.aiAccessFor', { name: u.displayName })}
                    title={t('pages.admin.aiAccessHint')}
                    onChange={(e) => setAiAccess(u.id, e.target.value === 'on')}
                    style={st('height:34px;padding:0 8px;border-radius:10px;background:var(--surf2);border:none;color:var(--text);font-size:13px;outline:none')}
                  >
                    <option value="off">{t('pages.admin.aiAccessOff')}</option>
                    <option value="on">{t('pages.admin.aiAccessOn')}</option>
                  </select>
                )}
                <select
                  value={u.isAdmin ? 'admin' : 'user'}
                  disabled={me}
                  aria-label={t('pages.admin.roleFor', { name: u.displayName })}
                  onChange={(e) => setAdmin(u.id, e.target.value === 'admin')}
                  style={st(`height:34px;padding:0 8px;border-radius:10px;background:var(--surf2);border:none;color:var(--text);font-size:13px;outline:none;opacity:${me ? 0.5 : 1}`)}
                >
                  <option value="user">{t('pages.admin.roleUser')}</option>
                  <option value="admin">{t('pages.admin.roleAdmin')}</option>
                </select>
                {!me && (
                  <button type="button" onClick={() => deleteUser(u.id, u.displayName)} aria-label={t('pages.admin.deleteUser')} style={st('width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:var(--danger);font-size:17px;line-height:1')}>
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </Group>
      </Collapsible>

      <AdminBackups />

      <a
        href={`${getBasePath()}/api/admin/logs/export`}
        download
        style={st('align-self:flex-start;display:flex;align-items:center;height:42px;padding:0 18px;border-radius:999px;border:1px solid var(--line);color:var(--text);font:600 13.5px var(--font-ui);text-decoration:none')}
      >
        {t('pages.admin.downloadLogs')}
      </a>
    </PageShell>
  );
}
