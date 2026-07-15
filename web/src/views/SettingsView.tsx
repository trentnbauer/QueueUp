import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS } from '@squadqueue/shared';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { adminApi } from '../api/admin';
import { ActionErrorBanner } from '../components/ActionErrorBanner';
import styles from './SettingsView.module.css';

export function SettingsView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [actionError, setActionError] = useState<string | null>(null);

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
      message: 'This also deletes their personal shelf games and votes.',
      confirmLabel: 'Delete',
      danger: true,
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
    </div>
  );
}
