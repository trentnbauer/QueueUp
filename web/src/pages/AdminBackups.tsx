import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminBackupInfo, RestoreBackupResponse } from '@queueup/shared';
import { adminApi, RestoreError, type RestoreOptions } from '../api/admin';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn, Collapsible, Group, Toggle, inputField } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { rich, t as tr, useT, type MessageKey } from '../i18n';

const PRESETS: [MessageKey, string][] = [
  ['pages.backups.preset.nightly', '0 3 * * *'],
  ['pages.backups.preset.midnight', '0 0 * * *'],
  ['pages.backups.preset.sixHours', '0 */6 * * *'],
  ['pages.backups.preset.sundays', '0 3 * * 0'],
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
  const t = useT();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'key' | 'skip' | null>(null);

  async function go(opts: RestoreOptions, which: 'key' | 'skip') {
    setBusy(which);
    setError(null);
    try {
      onDone(await call(opts));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pages.backups.restoreFailed'));
      setBusy(null);
    }
  }

  return (
    <Dialog onClose={() => busy === null && onCancel()} alert width={520} ariaLabel={t('pages.backups.keyNeeded')} bare padded={false}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (key && busy === null) void go({ sessionKey: key }, 'key');
        }}
        style={st('display:flex;flex-direction:column;gap:14px;padding:24px 22px 22px')}
      >
        <span style={st('font:700 21px/1.2 var(--font-display);letter-spacing:-0.02em')}>{t('pages.backups.keyNeeded')}</span>
        <span style={st('font:400 14.5px/1.5 var(--font-ui);color:var(--text2);text-wrap:pretty')}>
          {rich(t('pages.backups.keyBody'), { message, secret: <code>SESSION_SECRET</code> })}
        </span>
        <label style={st('display:flex;flex-direction:column;gap:8px;font:600 12.5px var(--font-ui);color:var(--muted)')}>
          {t('pages.backups.oldKey')}
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
          {t('pages.backups.withoutHint')}
        </span>
        <div style={st('display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:6px')}>
          <Btn kind="ghost" height={44} style={{ background: 'var(--chip)', color: 'var(--text)' }} disabled={busy !== null} onClick={onCancel}>
            {t('common.cancel')}
          </Btn>
          <Btn height={44} disabled={busy !== null} onClick={() => go({ skipEncrypted: true }, 'skip')}>
            {busy === 'skip' ? t('pages.backups.restoring') : t('pages.backups.restoreWithout')}
          </Btn>
          <Btn kind="danger" type="submit" height={44} weight={700} disabled={!key || busy !== null}>
            {busy === 'key' ? t('pages.backups.restoring') : t('pages.backups.restoreWithKey')}
          </Btn>
        </div>
      </form>
    </Dialog>
  );
}

const KIND_LABEL: Record<AdminBackupInfo['kind'], MessageKey> = {
  nightly: 'pages.backups.kind.nightly',
  manual: 'pages.backups.kind.manual',
  'pre-restore': 'pages.backups.kind.preRestore',
  'pre-schema-push': 'pages.backups.kind.preSchemaPush',
  'risky-upgrade': 'pages.backups.kind.riskyUpgrade',
};

/** Administrator menu > Backups: nightly backup settings (on by default, editable cron), the stored
 * backups, back up now, download, delete, restore, and import from a file. */
export function AdminBackups() {
  const qc = useQueryClient();
  const t = useT();
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
    const ok = await run('settings', () => adminApi.updateBackupSettings(patch), tr('pages.backups.saveFailed'));
    if (ok) {
      await refresh();
      ui.notify(message);
    }
  }

  async function backUpNow() {
    const res = await run('now', adminApi.createBackup, tr('pages.backups.backupFailed'));
    if (res) {
      await refresh();
      ui.notify(tr('pages.backups.created'));
    }
  }

  async function restoreFrom(name: string) {
    const ok = await confirm({
      title: tr('pages.backups.restoreTitle'),
      message: tr('pages.backups.restoreMessage', { name }),
      confirmLabel: tr('pages.backups.restore'),
      danger: true,
    });
    if (!ok) return;
    await restoreWith('restore', (opts) => adminApi.restoreBackup(name, opts), 'restore');
  }

  async function importFile(file: File) {
    const ok = await confirm({
      title: tr('pages.backups.importTitle', { name: file.name }),
      message: tr('pages.backups.importMessage'),
      confirmLabel: tr('pages.backups.importConfirm'),
      danger: true,
    });
    if (!ok) return;
    await restoreWith('import', (opts) => adminApi.importBackup(file, opts), 'import');
  }

  /** Runs a restore or import with this server's session key first. If the backup's encrypted keys
   * were made with another one, asks for it (or to restore without them) instead of failing. */
  async function restoreWith(key: string, call: RestoreCall, kind: 'restore' | 'import') {
    const done = (res: RestoreBackupResponse) => {
      setKeyPrompt(null);
      void refresh();
      const n = res.skippedEncrypted;
      const base = kind === 'import' ? 'pages.backups.imported' : 'pages.backups.restored';
      ui.notify(tr((n > 0 ? `${base}Skipped.${n === 1 ? 'one' : 'other'}` : base) as MessageKey, { rows: res.rows, n }));
      setTimeout(() => window.location.reload(), 1500);
    };
    setBusy(key);
    try {
      done(await call({}));
    } catch (e) {
      if (e instanceof RestoreError && e.code === 'session_key_required') setKeyPrompt({ message: e.message, call, done });
      else fail(e, tr(kind === 'import' ? 'pages.backups.importFailed' : 'pages.backups.restoreFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(b: AdminBackupInfo) {
    const ok = await confirm({ title: tr('pages.backups.deleteTitle'), message: b.name, confirmLabel: tr('common.delete'), danger: true });
    if (!ok) return;
    if (await run(b.name, () => adminApi.deleteBackup(b.name).then(() => true), tr('pages.backups.deleteFailed'))) {
      await refresh();
    }
  }

  const cronChanged = settings && cron.trim().replace(/\s+/g, ' ') !== settings.cron;
  const retentionChanged = settings && retention !== String(settings.retention);
  const input = 'height:40px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--surf2);color:var(--text);font:500 14px var(--font-mono);outline:none';

  return (
    <Collapsible title={t('pages.backups.kicker')}>
      <Group>
        <div style={st('display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surf)')}>
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <span style={st('font:600 14.5px var(--font-ui)')}>{t('pages.backups.scheduled')}</span>
            <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>
              {settings?.enabled
                ? settings.nextRunAt
                  ? t('pages.backups.nextRun', { date: fmtDate(settings.nextRunAt), timezone: settings.timezone })
                  : t('pages.backups.neverFires')
                : t('pages.backups.off')}
            </span>
          </span>
          {settings && <Toggle on={settings.enabled} label={t('pages.backups.scheduled')} onChange={(v) => saveSettings({ enabled: v }, v ? t('pages.backups.scheduledOn') : t('pages.backups.scheduledOff'))} />}
        </div>

        <div style={st('display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:var(--surf)')}>
          <span style={st('font:600 14.5px var(--font-ui)')}>{t('pages.backups.schedule')}</span>
          <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>
            {rich(t('pages.backups.scheduleHint'), { cron: <code>0 3 * * *</code> })}
          </span>
          <div style={st('display:flex;gap:8px;flex-wrap:wrap;align-items:center')}>
            <input value={cron} onChange={(e) => setCron(e.target.value)} aria-label={t('pages.backups.scheduleAria')} spellCheck={false} style={st(input, { width: 180 })} />
            {cronChanged && (
              <Btn kind="accent" height={40} padX={16} fontSize={13} disabled={busy === 'settings'} onClick={() => saveSettings({ cron }, t('pages.backups.scheduleSaved'))}>
                {t('pages.backups.saveSchedule')}
              </Btn>
            )}
          </div>
          <div style={st('display:flex;gap:6px;flex-wrap:wrap')}>
            {PRESETS.map(([label, value]) => (
              <button key={value} type="button" onClick={() => setCron(value)} style={st('height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text2);font:500 12.5px var(--font-ui)')}>
                {t(label)}
              </button>
            ))}
          </div>
          <div style={st('display:flex;gap:8px;align-items:center;margin-top:4px')}>
            {/* "Keep the latest {input} backups": the words either side of the number box. */}
            {t('pages.backups.keepLatest')
              .split('{input}')
              .map((words, i) => (
                <Fragment key={i}>
                  {i > 0 && <input type="number" min={1} max={365} value={retention} onChange={(e) => setRetention(e.target.value)} aria-label={t('pages.backups.keepAria')} style={st(input, { width: 80 })} />}
                  {words.trim() && <span style={st('font:500 13px var(--font-ui);color:var(--text2)')}>{words.trim()}</span>}
                </Fragment>
              ))}
            {retentionChanged && (
              <Btn height={40} padX={14} fontSize={13} disabled={busy === 'settings'} onClick={() => saveSettings({ retention: Number(retention) }, t('pages.admin.saved'))}>
                {t('common.save')}
              </Btn>
            )}
          </div>
        </div>

        <div style={st('display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;background:var(--surf)')}>
          <span style={st('flex:1 1 220px;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <span style={st('font:600 14.5px var(--font-ui)')}>{t('pages.backups.backUpNow')}</span>
            <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>
              {settings?.lastRun
                ? `${settings.lastRun.ok ? t('pages.backups.lastRunOk', { date: fmtDate(settings.lastRun.at) }) : t('pages.backups.lastRunFailed', { date: fmtDate(settings.lastRun.at), message: settings.lastRun.message })} `
                : ''}
              {rich(t('pages.backups.savedTo'), { dir: <code>{settings?.directory ?? '…'}</code> })}
            </span>
            <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted);margin-top:4px')}>
              {rich(t('pages.backups.encryptedNote'), { secret: <code>SESSION_SECRET</code> })}
            </span>
          </span>
          <Btn kind="accent" height={40} padX={16} fontSize={13} disabled={busy === 'now'} onClick={backUpNow}>
            {busy === 'now' ? t('pages.backups.backingUp') : t('pages.backups.backUpNow')}
          </Btn>
          <Btn height={40} padX={16} fontSize={13} disabled={busy === 'import'} onClick={() => fileRef.current?.click()}>
            {busy === 'import' ? t('pages.backups.importing') : t('pages.backups.importFromFile')}
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

        {data?.backups.length === 0 && <div style={st('padding:16px;background:var(--surf);color:var(--muted);font-size:14px')}>{t('pages.backups.none')}</div>}
        {data?.backups.map((b) => (
          <div key={b.name} style={st('display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:var(--surf)')}>
            <span style={st('flex:1 1 200px;min-width:0;display:flex;flex-direction:column;gap:1px')}>
              <span style={st('font:600 13.5px var(--font-ui)')}>{fmtDate(b.createdAt)}</span>
              <span style={st('font:400 12px var(--font-ui);color:var(--muted);overflow:hidden;text-overflow:ellipsis')}>
                {t(KIND_LABEL[b.kind])} · {fmtSize(b.sizeBytes)} · {b.name}
              </span>
            </span>
            <a href={`${getBasePath()}/api/admin/backups/${encodeURIComponent(b.name)}/download`} download style={st('height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);color:var(--text);font:600 12.5px var(--font-ui);display:flex;align-items:center;text-decoration:none')}>
              {t('pages.backups.download')}
            </a>
            <Btn height={32} padX={12} fontSize={12.5} disabled={busy === 'restore'} onClick={() => restoreFrom(b.name)}>
              {t('pages.backups.restore')}
            </Btn>
            <button type="button" onClick={() => remove(b)} aria-label={t('pages.backups.deleteAria', { name: b.name })} style={st('width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:var(--danger);font-size:17px;line-height:1')}>
              ×
            </button>
          </div>
        ))}
      </Group>
      {keyPrompt && <SessionKeyDialog message={keyPrompt.message} call={keyPrompt.call} onDone={keyPrompt.done} onCancel={() => setKeyPrompt(null)} />}
    </Collapsible>
  );
}
