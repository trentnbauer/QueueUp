import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS } from '@queueup/shared';
import type { AdminIntegrationStatus, ConfigSource, IntegrationConfigKey } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { adminApi } from '../api/admin';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import styles from './SettingsView.module.css';

interface IntegrationField {
  key: IntegrationConfigKey;
  label: string;
  source: ConfigSource;
}

function integrationFields(status: AdminIntegrationStatus): IntegrationField[] {
  return [
    { key: 'GGDEALS_API_KEY', label: 'gg.deals API key', source: status.ggDealsApiKeySource },
    { key: 'IGDB_CLIENT_ID', label: 'IGDB Client ID', source: status.igdbClientIdSource },
    { key: 'IGDB_CLIENT_SECRET', label: 'IGDB Client Secret', source: status.igdbClientSecretSource },
  ];
}

export function SettingsView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [actionError, setActionError] = useState<string | null>(null);
  const [archiveResult, setArchiveResult] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [integrationInputs, setIntegrationInputs] = useState<Record<string, string>>({});
  const [savingIntegrationKey, setSavingIntegrationKey] = useState<string | null>(null);
  const [savingRoleUserId, setSavingRoleUserId] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview, enabled: !!user?.isAdmin });
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: adminApi.users, enabled: !!user?.isAdmin });
  const rooms = useQuery({ queryKey: ['admin', 'rooms'], queryFn: adminApi.rooms, enabled: !!user?.isAdmin });

  if (!user) return null;
  if (!user.isAdmin) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>You don't have administrator access.</p>
      </div>
    );
  }

  async function handleDeleteUser(id: string) {
    const ok = await confirm({
      title: 'Delete user?',
      message: "This also deletes their personal shelf games and votes. This can't be undone.",
      confirmLabel: 'Delete',
      danger: true,
      typedConfirmation: 'DELETE',
    });
    if (!ok) return;
    try {
      await adminApi.deleteUser(id);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete user');
    }
  }

  async function handleDeleteRoom(id: string) {
    const ok = await confirm({
      title: 'Delete room?',
      message: 'This also deletes all its games and removes all members.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.deleteRoom(id);
      queryClient.invalidateQueries({ queryKey: ['admin', 'rooms'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete room');
    }
  }

  async function handleArchiveDoneGames() {
    const ok = await confirm({
      title: 'Archive old Done games?',
      message:
        "Games marked Done and untouched for 90+ days will be hidden from their room/shelf. This doesn't delete anything - it's reversible in the database if ever needed.",
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    setArchiving(true);
    setArchiveResult(null);
    try {
      const { archivedCount } = await adminApi.archiveDoneGames();
      setArchiveResult(
        archivedCount === 0 ? 'No games qualified - nothing to archive.' : `Archived ${archivedCount} game(s).`,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not archive old games');
    } finally {
      setArchiving(false);
    }
  }

  async function handleSetUserAdmin(id: string, isAdmin: boolean) {
    setSavingRoleUserId(id);
    setActionError(null);
    try {
      await adminApi.setUserAdmin(id, isAdmin);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update that user's role");
    } finally {
      setSavingRoleUserId(null);
    }
  }

  async function handleSaveIntegration(key: IntegrationConfigKey) {
    const value = (integrationInputs[key] ?? '').trim();
    if (!value) return;
    setSavingIntegrationKey(key);
    setActionError(null);
    try {
      await adminApi.setIntegrationConfig(key, value);
      setIntegrationInputs((prev) => ({ ...prev, [key]: '' }));
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save setting');
    } finally {
      setSavingIntegrationKey(null);
    }
  }

  async function handleClearIntegration(key: IntegrationConfigKey, label: string) {
    const ok = await confirm({
      title: `Clear ${label}?`,
      message:
        'This removes the DB-stored fallback value. The integration will be treated as unconfigured unless an env var is set for it.',
      confirmLabel: 'Clear',
      danger: true,
    });
    if (!ok) return;
    setSavingIntegrationKey(key);
    setActionError(null);
    try {
      await adminApi.clearIntegrationConfig(key);
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not clear setting');
    } finally {
      setSavingIntegrationKey(null);
    }
  }

  const status = overview.data?.status;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Administrator Settings</h1>
      <ActionErrorBanner message={actionError} onDismiss={() => setActionError(null)} padded={false} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Integrations</div>
        {status && (
          <div className={styles.pillRow}>
            <span className={styles.pill}>
              gg.deals API key:{' '}
              <span className={status.ggDealsApiKeyConfigured ? styles.pillOk : styles.pillMissing}>
                {status.ggDealsApiKeyConfigured ? 'configured' : 'missing'}
              </span>
            </span>
            <span className={styles.pill}>
              IGDB:{' '}
              <span className={status.igdbConfigured ? styles.pillOk : styles.pillMissing}>
                {status.igdbConfigured ? 'configured' : 'missing'}
              </span>
            </span>
            {status.devFakeAuth ? (
              <span className={styles.pill}>
                Sign-in: <span className={styles.pillMissing}>DEV_FAKE_AUTH (not for production)</span>
              </span>
            ) : status.activeAuthProviders.length > 0 ? (
              status.activeAuthProviders.map((p) => (
                <span key={p} className={styles.pill}>
                  Sign-in: <span className={styles.pillOk}>{p}</span>
                </span>
              ))
            ) : (
              <span className={styles.pill}>
                Sign-in: <span className={styles.pillMissing}>none configured</span>
              </span>
            )}
          </div>
        )}

        {status && (
          <div className={styles.table}>
            {integrationFields(status).map((f) => (
              <div key={f.key} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{f.label}</span>
                  <span className={styles.rowSubtitle}>
                    {f.source === 'env'
                      ? 'Set via .env (takes precedence over any DB value)'
                      : f.source === 'db'
                        ? 'Set via this Settings panel (DB fallback)'
                        : 'Not configured'}
                  </span>
                </div>
                {f.source === 'env' ? (
                  <span className={styles.pillOk}>configured</span>
                ) : (
                  <div className={styles.integrationEditor}>
                    <input
                      type="password"
                      autoComplete="off"
                      className={styles.integrationInput}
                      placeholder={f.source === 'db' ? 'Enter a new value to replace it' : 'Enter value'}
                      value={integrationInputs[f.key] ?? ''}
                      onChange={(e) => setIntegrationInputs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                    <button
                      className={styles.archiveButton}
                      disabled={savingIntegrationKey === f.key || !(integrationInputs[f.key] ?? '').trim()}
                      onClick={() => handleSaveIntegration(f.key)}
                    >
                      Save
                    </button>
                    {f.source === 'db' && (
                      <button
                        className={styles.deleteButton}
                        disabled={savingIntegrationKey === f.key}
                        onClick={() => handleClearIntegration(f.key, f.label)}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Rooms ({rooms.data?.rooms.length ?? 0})</div>
        <div className={styles.table}>
          {rooms.data?.rooms.length === 0 && <div className={styles.row}>No rooms yet.</div>}
          {rooms.data?.rooms.map((r) => (
            <div key={r.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{r.name}</span>
                <span className={styles.rowSubtitle}>
                  {ROOM_PLATFORM_LABELS[r.platform]} · Created by {r.creatorDisplayName} · {r.memberCount} member
                  {r.memberCount === 1 ? '' : 's'} · {r.gameCount} game{r.gameCount === 1 ? '' : 's'}
                </span>
              </div>
              <button className={styles.deleteButton} onClick={() => handleDeleteRoom(r.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Users ({users.data?.users.length ?? 0})</div>
        <div className={styles.table}>
          {users.data?.users.map((u) => (
            <div key={u.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {u.displayName} {u.isAdmin && <span className={styles.adminBadge}>ADMIN</span>}
                </span>
                <span className={styles.rowSubtitle}>{u.email}</span>
              </div>
              <select
                className={styles.roleSelect}
                value={u.isAdmin ? 'admin' : 'user'}
                disabled={u.id === user.id || savingRoleUserId === u.id}
                title={u.id === user.id ? "You can't change your own administrator status" : undefined}
                onChange={(e) => handleSetUserAdmin(u.id, e.target.value === 'admin')}
              >
                <option value="user">User</option>
                <option value="admin">Administrator</option>
              </select>
              <button
                className={styles.deleteButton}
                onClick={() => handleDeleteUser(u.id)}
                disabled={u.id === user.id}
                title={u.id === user.id ? "You can't delete your own account" : undefined}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Maintenance</div>
        <div className={styles.maintenanceRow}>
          <button className={styles.archiveButton} onClick={handleArchiveDoneGames} disabled={archiving}>
            {archiving ? 'Archiving…' : 'Archive Done games untouched for 90+ days'}
          </button>
          {archiveResult && <span className={styles.archiveResult}>{archiveResult}</span>}
        </div>
        <div className={styles.maintenanceRow}>
          {/* A plain link, not a fetch+blob dance - the browser already sends the session cookie
              for a same-origin navigation, and the server's Content-Disposition header is what
              actually triggers the download rather than navigating away from the page. */}
          <a className={styles.archiveButton} href="/api/admin/logs/export" download>
            Download troubleshooting logs
          </a>
        </div>
      </div>
    </div>
  );
}
