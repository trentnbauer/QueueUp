import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBackupInfo, RestoreBackupResponse } from '@queueup/shared';
import { adminApi, RestoreError, type RestoreOptions } from '../api/admin';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn, Group, Kicker, Toggle, inputField } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';

const PRESETS: [string, string][] = [
  ['Every night at 3:00', '0 3 * * *'],
  ['Every night at midnight', '0 0 * * *'],
  ['Every 6 hours', '0 */6 * * *'],
  ['Sundays at 3:00', '0 3 * * 0'],
];

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
type RestoreCall = (opts: RestoreOptions) => Promise<RestoreBackupResponse>;

/** Shown when a backup's encrypted keys were made with a different session key (SESSION_SECRET):
 * restore with the old key so they come across, or restore everything else without them. */
function SessionKeyDialog({
  message,
  call,
  onDone,
  onCancel,
}: {
  message: string;
  call: RestoreCall;
  onDone: (res: RestoreBackupResponse) => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'key' | 'skip' | null>(null);

  async function go(opts: RestoreOptions, which: 'key' | 'skip') {
    setBusy(which);
    setError(null);
    try {
      onDone(await call(opts));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
      setBusy(null);
    }
  }

  return (
    <Dialog onClose={() => busy === null && onCancel()} alert width={520} ariaLabel="Session key needed" bare padded={false}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (key && busy === null) void go({ sessionKey: key }, 'key');
        }}
        style={st('display:flex;flex-direction:column;gap:14px;padding:24px 22px 22px')}
      >
        <span style={st('font:700 21px/1.2 var(--font-display);letter-spacing:-0.02em')}>Session key needed</span>
        <span style={st('font:400 14.5px/1.5 var(--font-ui);color:var(--text2);text-wrap:pretty')}>
          {message} Enter the <code>SESSION_SECRET</code> of the server that made it, or restore without them.
        </span>
        <label style={st('display:flex;flex-direction:column;gap:8px;font:600 12.5px var(--font-ui);color:var(--muted)')}>
          Session key from the old server
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            style={st(inputField, { width: '100%' })}
          />
        </label>
        {error && <span role="alert" style={st('font:500 13px/1.4 var(--font-ui);color:var(--danger)')}>{error}</span>}
        <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>
          Restoring without it brings back everything else; the integration keys then need entering again in Administrator settings.
        </span>
        <div style={st('display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:6px')}>
          <Btn kind="ghost" height={44} style={{ background: 'var(--chip)', color: 'var(--text)' }} disabled={busy !== null} onClick={onCancel}>
            Cancel
          </Btn>
          <Btn height={44} disabled={busy !== null} onClick={() => go({ skipEncrypted: true }, 'skip')}>
            {busy === 'skip' ? 'Restoring…' : 'Restore without them'}
          </Btn>
          <Btn kind="danger" type="submit" height={44} weight={700} disabled={!key || busy !== null}>
            {busy === 'key' ? 'Restoring…' : 'Restore with key'}
          </Btn>
        </div>
      </form>
    </Dialog>
  );
}

const KIND_LABEL: Record<AdminBackupInfo['kind'], string> = { nightly: 'Scheduled', manual: 'Manual', 'pre-restore': 'Before a restore', 'pre-schema-push': 'Before a schema change' };

/** Administrator menu > Backups: nightly backup settings (on by default, editable cron), the stored
 * backups, back up now, download, delete, restore, and import from a file. */
export function AdminBackups() {
  const qc = useQueryClient();
  const ui = useUi();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data } = useQuery({ queryKey: ['admin', 'backups'], queryFn: adminApi.backups });
  const [cron, setCron] = useState('');
  const [retention, setRetention] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [keyPrompt, setKeyPrompt] = useState<{ message: string; call: RestoreCall; done: (res: RestoreBackupResponse) => void } | null>(null);

  const settings = data?.settings;
  useEffect(() => {
    if (settings) {
      setCron(settings.cron);
      setRetention(String(settings.retention));
    }
    // Only re-seed the inputs when the saved values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.cron, settings?.retention]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'backups'] });
  const fail = (e: unknown, fallback: string) => ui.showError(e instanceof Error ? e.message : fallback);

  async function run<T>(key: string, fn: () => Promise<T>, fallback: string): Promise<T | undefined> {
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      fail(e, fallback);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings(patch: { enabled?: boolean; cron?: string; retention?: number }, message: string) {
    const ok = await run('settings', () => adminApi.updateBackupSettings(patch), 'Could not save the backup settings');
    if (ok) {
      await refresh();
      ui.notify(message);
    }
  }

  async function backUpNow() {
    const res = await run('now', adminApi.createBackup, 'Backup failed');
    if (res) {
      await refresh();
      ui.notify('Backup created');
    }
  }

  async function restoreFrom(name: string) {
    const ok = await confirm({
      title: 'Restore this backup?',
      message: `This replaces EVERYTHING in the database (every user, room, game and setting) with the contents of ${name}. A safety backup of the current data is taken first. Everyone may need to reload.`,
      confirmLabel: 'Restore',
      danger: true,
    });
    if (!ok) return;
    await restoreWith('restore', (opts) => adminApi.restoreBackup(name, opts), 'Restored');
  }

  async function importFile(file: File) {
    const ok = await confirm({
      title: `Import ${file.name}?`,
      message: 'This replaces EVERYTHING in the database with the contents of this file. A safety backup of the current data is taken first.',
      confirmLabel: 'Import and restore',
      danger: true,
    });
    if (!ok) return;
    await restoreWith('import', (opts) => adminApi.importBackup(file, opts), 'Imported');
  }

  /** Runs a restore or import with this server's session key first. If the backup's encrypted keys
   * were made with another one, asks for it (or to restore without them) instead of failing. */
  async function restoreWith(key: string, call: RestoreCall, verb: string) {
    const done = (res: RestoreBackupResponse) => {
      setKeyPrompt(null);
      void refresh();
      const skipped = res.skippedEncrypted > 0 ? ` (${res.skippedEncrypted} encrypted key${res.skippedEncrypted === 1 ? '' : 's'} left out)` : '';
      ui.notify(`${verb} ${res.rows} rows${skipped}. Reloading…`);
      setTimeout(() => window.location.reload(), 1500);
    };
    setBusy(key);
    try {
      done(await call({}));
    } catch (e) {
      if (e instanceof RestoreError && e.code === 'session_key_required') setKeyPrompt({ message: e.message, call, done });
      else fail(e, `${verb === 'Imported' ? 'Import' : 'Restore'} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(b: AdminBackupInfo) {
    const ok = await confirm({ title: 'Delete this backup?', message: b.name, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    if (await run(b.name, () => adminApi.deleteBackup(b.name).then(() => true), 'Could not delete that backup')) {
      await refresh();
    }
  }

  const cronChanged = settings && cron.trim().replace(/\s+/g, ' ') !== settings.cron;
  const retentionChanged = settings && retention !== String(settings.retention);
  const input = 'height:40px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--surf2);color:var(--text);font:500 14px var(--font-mono);outline:none';

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <Kicker>BACKUPS</Kicker>
      <Group>
        <div style={st('display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surf)')}>
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <span style={st('font:600 14.5px var(--font-ui)')}>Scheduled backup</span>
            <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>
              {settings?.enabled
                ? settings.nextRunAt
                  ? `Next run ${fmtDate(settings.nextRunAt)} (server time, ${settings.timezone})`
                  : 'The schedule never fires'
                : 'Off. No backups are being taken automatically.'}
            </span>
          </span>
          {settings && <Toggle on={settings.enabled} label="Scheduled backup" onChange={(v) => saveSettings({ enabled: v }, v ? 'Scheduled backup on' : 'Scheduled backup off')} />}
        </div>

        <div style={st('display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:var(--surf)')}>
          <span style={st('font:600 14.5px var(--font-ui)')}>Schedule (cron)</span>
          <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>
            Five fields: minute, hour, day of month, month, day of week. Default <code>0 3 * * *</code> is 3:00 every night.
          </span>
          <div style={st('display:flex;gap:8px;flex-wrap:wrap;align-items:center')}>
            <input value={cron} onChange={(e) => setCron(e.target.value)} aria-label="Backup schedule (cron)" spellCheck={false} style={st(input, { width: 180 })} />
            {cronChanged && (
              <Btn kind="accent" height={40} padX={16} fontSize={13} disabled={busy === 'settings'} onClick={() => saveSettings({ cron }, 'Schedule saved')}>
                Save schedule
              </Btn>
            )}
          </div>
          <div style={st('display:flex;gap:6px;flex-wrap:wrap')}>
            {PRESETS.map(([label, value]) => (
              <button key={value} type="button" onClick={() => setCron(value)} style={st('height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text2);font:500 12.5px var(--font-ui)')}>
                {label}
              </button>
            ))}
          </div>
          <div style={st('display:flex;gap:8px;align-items:center;margin-top:4px')}>
            <span style={st('font:500 13px var(--font-ui);color:var(--text2)')}>Keep the latest</span>
            <input type="number" min={1} max={365} value={retention} onChange={(e) => setRetention(e.target.value)} aria-label="Backups to keep" style={st(input, { width: 80 })} />
            <span style={st('font:500 13px var(--font-ui);color:var(--text2)')}>backups</span>
            {retentionChanged && (
              <Btn height={40} padX={14} fontSize={13} disabled={busy === 'settings'} onClick={() => saveSettings({ retention: Number(retention) }, 'Saved')}>
                Save
              </Btn>
            )}
          </div>
        </div>

        <div style={st('display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;background:var(--surf)')}>
          <span style={st('flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <span style={st('font:600 14.5px var(--font-ui)')}>Back up now</span>
            <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>
              {settings?.lastRun ? `Last scheduled run ${fmtDate(settings.lastRun.at)}: ${settings.lastRun.ok ? 'ok' : `failed (${settings.lastRun.message})`}. ` : ''}
              Saved to <code>{settings?.directory ?? '…'}</code>
            </span>
            <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted);margin-top:4px')}>
              🔒 Integration keys saved in Administrator settings are encrypted with this server's session key (<code>SESSION_SECRET</code>). Restoring them on a
              server with a different session key needs the original one; without it, everything else restores and those keys have to be entered again.
            </span>
          </span>
          <Btn kind="accent" height={40} padX={16} fontSize={13} disabled={busy === 'now'} onClick={backUpNow}>
            {busy === 'now' ? 'Backing up…' : 'Back up now'}
          </Btn>
          <Btn height={40} padX={16} fontSize={13} disabled={busy === 'import'} onClick={() => fileRef.current?.click()}>
            {busy === 'import' ? 'Importing…' : 'Import from file…'}
          </Btn>
          <input
            ref={fileRef}
            type="file"
            accept=".gz,.json.gz,application/gzip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>

        {data?.backups.length === 0 && <div style={st('padding:16px;background:var(--surf);color:var(--muted);font-size:14px')}>No backups yet.</div>}
        {data?.backups.map((b) => (
          <div key={b.name} style={st('display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:var(--surf)')}>
            <span style={st('flex:1 1 200px;min-width:0;display:flex;flex-direction:column;gap:1px')}>
              <span style={st('font:600 13.5px var(--font-ui)')}>{fmtDate(b.createdAt)}</span>
              <span style={st('font:400 12px var(--font-ui);color:var(--muted);overflow:hidden;text-overflow:ellipsis')}>
                {KIND_LABEL[b.kind]} · {fmtSize(b.sizeBytes)} · {b.name}
              </span>
            </span>
            <a href={`${getBasePath()}/api/admin/backups/${encodeURIComponent(b.name)}/download`} download style={st('height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);color:var(--text);font:600 12.5px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
              Download
            </a>
            <Btn height={32} padX={12} fontSize={12.5} disabled={busy === 'restore'} onClick={() => restoreFrom(b.name)}>
              Restore
            </Btn>
            <button type="button" onClick={() => remove(b)} aria-label={`Delete ${b.name}`} style={st('width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:var(--danger);font-size:17px;line-height:1')}>
              ×
            </button>
          </div>
        ))}
      </Group>
      {keyPrompt && <SessionKeyDialog message={keyPrompt.message} call={keyPrompt.call} onDone={keyPrompt.done} onCancel={() => setKeyPrompt(null)} />}
    </div>
  );
}
