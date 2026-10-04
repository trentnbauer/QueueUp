import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, type AdminIntegrationStatus, type ConfigSource, type IntegrationConfigKey, type TunnelState } from '@queueup/shared';
import { adminApi } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Avatar, Banner, Btn, Group, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { AdminBackups } from './AdminBackups';
import { PageShell } from './PageShell';

function fields(s: AdminIntegrationStatus): { key: IntegrationConfigKey; label: string; source: ConfigSource }[] {
  return [
    { key: 'GGDEALS_API_KEY', label: 'gg.deals API key', source: s.ggDealsApiKeySource },
    { key: 'IGDB_CLIENT_ID', label: 'IGDB Client ID', source: s.igdbClientIdSource },
    { key: 'IGDB_CLIENT_SECRET', label: 'IGDB Client Secret', source: s.igdbClientSecretSource },
    { key: 'SCANDEX_API_KEY', label: 'ScanDex API key (barcode scan)', source: s.scandexApiKeySource },
    { key: 'TURNSTILE_SITE_KEY', label: 'Turnstile site key (sign-in captcha)', source: s.turnstileSiteKeySource },
    { key: 'TURNSTILE_SECRET_KEY', label: 'Turnstile secret key (sign-in captcha)', source: s.turnstileSecretKeySource },
    { key: 'GA_MEASUREMENT_ID', label: 'Google Analytics measurement ID (G-XXXXXXXXXX)', source: s.gaMeasurementIdSource },
  ];
}

function smtpFields(s: AdminIntegrationStatus): { key: IntegrationConfigKey; label: string; source: ConfigSource; plain?: boolean }[] {
  return [
    { key: 'SMTP_HOST', label: 'SMTP host', source: s.smtpSources.SMTP_HOST, plain: true },
    { key: 'SMTP_PORT', label: 'SMTP port (465 uses TLS, others use STARTTLS)', source: s.smtpSources.SMTP_PORT, plain: true },
    { key: 'SMTP_USER', label: 'SMTP user (optional)', source: s.smtpSources.SMTP_USER, plain: true },
    { key: 'SMTP_PASSWORD', label: 'SMTP password (optional)', source: s.smtpSources.SMTP_PASSWORD },
    { key: 'SMTP_FROM', label: 'From address, e.g. QueueUp <alerts@example.com>', source: s.smtpSources.SMTP_FROM, plain: true },
  ];
}

/** The container's own port (PORT), which the tunnel's public hostname should point at. */
const TUNNEL_PORT_HINT = 3000;

const TUNNEL_STATE: Record<TunnelState, { label: string; color: string }> = {
  off: { label: 'Off', color: 'var(--muted)' },
  starting: { label: 'Connecting…', color: 'var(--text2)' },
  connected: { label: 'Connected', color: 'var(--mint)' },
  error: { label: 'Retrying', color: 'var(--danger)' },
  unavailable: { label: 'cloudflared not installed', color: 'var(--danger)' },
};

const PILL = 'height:30px;padding:0 12px;border-radius:999px;background:var(--surf);display:flex;align-items:center;gap:6px;font:500 12.5px var(--font-ui)';

/** Administrator settings: integration keys, rooms and users on this server. */
export function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const ui = useUi();
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

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
      <PageShell title="Administrator settings">
        <span style={st('color:var(--muted)')}>You don't have administrator access.</span>
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
      ui.notify('Saved');
    } catch (e) {
      fail(e, 'Could not save setting');
    } finally {
      setBusyKey(null);
    }
  }

  async function clear(key: IntegrationConfigKey, label: string) {
    const ok = await confirm({
      title: `Clear ${label}?`,
      message: 'This removes the DB-stored fallback value. The integration is treated as unconfigured unless an env var is set for it.',
      confirmLabel: 'Clear',
      danger: true,
    });
    if (!ok) return;
    setBusyKey(key);
    try {
      await adminApi.clearIntegrationConfig(key);
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    } catch (e) {
      fail(e, 'Could not clear setting');
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteRoom(id: string, name: string) {
    const ok = await confirm({ title: `Delete ${name}?`, message: 'This also deletes all its games and removes all members.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await adminApi.deleteRoom(id);
      qc.invalidateQueries({ queryKey: ['admin', 'rooms'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    } catch (e) {
      fail(e, 'Could not delete room');
    }
  }

  async function deleteUser(id: string, name: string) {
    const ok = await confirm({
      title: `Delete ${name}?`,
      message: "This also deletes their personal shelf games and votes. This can't be undone.",
      confirmLabel: 'Delete',
      danger: true,
      typedConfirmation: 'DELETE',
    });
    if (!ok) return;
    try {
      await adminApi.deleteUser(id);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (e) {
      fail(e, 'Could not delete user');
    }
  }

  async function setAdmin(id: string, isAdmin: boolean) {
    try {
      await adminApi.setUserAdmin(id, isAdmin);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (e) {
      fail(e, "Could not update that user's role");
    }
  }

  async function sendTest() {
    setBusyKey('smtp-test');
    try {
      const res = await adminApi.sendTestEmail();
      ui.notify(`Test email sent to ${res.sentTo}`);
    } catch (e) {
      fail(e, 'Could not send the test email');
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
                      {f.source === 'env' ? 'Set via .env (takes precedence)' : f.source === 'db' ? 'Set here (DB fallback)' : 'Not configured'}
                    </span>
                  </span>
                  {f.source === 'env' && <span style={st('font:600 12px var(--font-ui);color:var(--mint)')}>configured</span>}
                </div>
                {f.source !== 'env' && (
                  <div style={st('display:flex;gap:6px')}>
                    <input
                      type={f.plain ? 'text' : 'password'}
                      autoComplete="off"
                      value={inputs[f.key] ?? ''}
                      onChange={(e) => setInputs((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.source === 'db' ? 'Enter a new value to replace it' : 'Enter value'}
                      aria-label={f.label}
                      style={st('flex:1;min-width:0;height:40px;padding:0 12px;border-radius:12px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-size:14px;outline:none')}
                    />
                    <Btn kind="text" height={40} padX={14} fontSize={12.5} weight={700} disabled={busyKey === f.key || !(inputs[f.key] ?? '').trim()} onClick={() => save(f.key)}>
                      Save
                    </Btn>
                    {f.source === 'db' && (
                      <Btn kind="ghost" height={40} padX={10} fontSize={12.5} style={{ color: 'var(--danger)' }} disabled={busyKey === f.key} onClick={() => clear(f.key, f.label)}>
                        Clear
                      </Btn>
                    )}
                  </div>
                )}
              </div>
  );

  return (
    <PageShell title="Administrator settings" hint="Integrations, rooms and users on this server.">
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {status && (
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          <span style={st(PILL)}>gg.deals <span style={st(`color:${status.ggDealsApiKeyConfigured ? 'var(--mint)' : 'var(--danger)'};font-weight:600`)}>{status.ggDealsApiKeyConfigured ? 'configured' : 'missing'}</span></span>
          <span style={st(PILL)}>IGDB <span style={st(`color:${status.igdbConfigured ? 'var(--mint)' : 'var(--danger)'};font-weight:600`)}>{status.igdbConfigured ? 'configured' : 'missing'}</span></span>
          {status.devFakeAuth ? (
            <span style={st(PILL)}>Sign-in <span style={st('color:var(--danger);font-weight:600')}>DEV_FAKE_AUTH (not for production)</span></span>
          ) : status.activeAuthProviders.length ? (
            status.activeAuthProviders.map((p) => (
              <span key={p} style={st(PILL)}>Sign-in <span style={st('color:var(--mint);font-weight:600')}>{p}</span></span>
            ))
          ) : (
            <span style={st(PILL)}>Sign-in <span style={st('color:var(--danger);font-weight:600')}>none configured</span></span>
          )}
        </div>
      )}

      {status && (
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <Kicker>INTEGRATION KEYS</Kicker>
          <Group>
            {fields(status).map(keyRow)}
          </Group>
        </div>
      )}

      {status && (
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <Kicker>EMAIL ALERTS (SMTP)</Kicker>
          <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>
            Lets people get their alerts by email. Each person switches on the alert types they want under Settings → Notifications; nothing is
            sent until they do.
          </span>
          <Group>{smtpFields(status).map(keyRow)}</Group>
          <div style={st('display:flex;align-items:center;gap:10px')}>
            <Btn kind="soft" height={40} padX={16} disabled={!status.smtpConfigured || busyKey === 'smtp-test'} onClick={sendTest}>
              {busyKey === 'smtp-test' ? 'Sending…' : 'Send a test email to me'}
            </Btn>
            {!status.smtpConfigured && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Set the host, port and from address first.</span>}
          </div>
        </div>
      )}

      {tunnel && (
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <Kicker>CLOUDFLARE TUNNEL</Kicker>
          <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>
            Reach QueueUp through Cloudflare without opening a port. Create a tunnel in Cloudflare Zero Trust (Networks → Tunnels), give it a
            public hostname that points to <code>http://localhost:{TUNNEL_PORT_HINT}</code>, and paste its token here. Set APP_BASE_URL to that
            hostname.
          </span>
          <Group>
            <div style={st('display:flex;align-items:center;gap:10px;min-height:52px;padding:10px 14px;background:var(--surf)')}>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>Status</span>
                {tunnel.lastError && tunnel.state !== 'connected' && (
                  <span style={st('font:400 12px var(--font-ui);color:var(--danger);overflow-wrap:anywhere')}>{tunnel.lastError}</span>
                )}
              </span>
              <span style={st(`font:600 12.5px var(--font-ui);color:${TUNNEL_STATE[tunnel.state].color}`)}>
                {TUNNEL_STATE[tunnel.state].label}
                {tunnel.state === 'connected' && ` · ${tunnel.connections} connection${tunnel.connections === 1 ? '' : 's'}`}
              </span>
            </div>
            {keyRow({ key: 'CLOUDFLARE_TUNNEL_TOKEN', label: 'Tunnel token', source: tunnel.source })}
          </Group>
        </div>
      )}

      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>ROOMS · {rooms.data?.rooms.length ?? 0}</Kicker>
        <Group>
          {rooms.data?.rooms.map((r) => (
            <div key={r.id} style={st('display:flex;align-items:center;gap:10px;min-height:60px;padding:8px 10px 8px 16px;background:var(--surf)')}>
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{r.name}</span>
                <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>
                  {r.platform ? ROOM_PLATFORM_LABELS[r.platform] : 'Any platform'} · by {r.creatorDisplayName} · {r.memberCount} member{r.memberCount === 1 ? '' : 's'} · {r.gameCount} game{r.gameCount === 1 ? '' : 's'}
                </span>
              </span>
              <Btn kind="ghost" height={32} padX={12} fontSize={12.5} style={{ color: 'var(--danger)' }} onClick={() => deleteRoom(r.id, r.name)}>
                Delete
              </Btn>
            </div>
          ))}
          {rooms.data?.rooms.length === 0 && <div style={st('padding:16px;background:var(--surf);color:var(--muted);font-size:14px')}>No rooms yet.</div>}
        </Group>
      </div>

      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>USERS · {users.data?.users.length ?? 0}</Kicker>
        <Group>
          {users.data?.users.map((u) => {
            const me = u.id === user.id;
            return (
              <div key={u.id} style={st('display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 16px;background:var(--surf)')}>
                <Avatar name={u.displayName} color={u.avatarColor} avatarUrl={null} size={30} fontSize={12} />
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                  <span style={st('font:600 14.5px var(--font-ui)')}>{u.displayName}</span>
                  <span style={st('font:400 12px var(--font-ui);color:var(--muted);overflow:hidden;text-overflow:ellipsis')}>{u.email}</span>
                </span>
                <select
                  value={u.isAdmin ? 'admin' : 'user'}
                  disabled={me}
                  aria-label={`Role for ${u.displayName}`}
                  onChange={(e) => setAdmin(u.id, e.target.value === 'admin')}
                  style={st(`height:34px;padding:0 8px;border-radius:10px;background:var(--surf2);border:none;color:var(--text);font-size:13px;outline:none;opacity:${me ? 0.5 : 1}`)}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                {!me && (
                  <button type="button" onClick={() => deleteUser(u.id, u.displayName)} aria-label="Delete user" style={st('width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:var(--danger);font-size:17px;line-height:1')}>
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </Group>
      </div>

      <AdminBackups />

      <a
        href={`${getBasePath()}/api/admin/logs/export`}
        download
        style={st('align-self:flex-start;display:flex;align-items:center;height:42px;padding:0 18px;border-radius:999px;border:1px solid var(--line);color:var(--text);font:600 13.5px var(--font-ui);text-decoration:none')}
      >
        Download troubleshooting logs
      </a>
    </PageShell>
  );
}
