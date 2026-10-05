import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibrarySyncProgress } from '@queueup/shared';
import { EXOPHASE_STATUS_QUERY_KEY, exophaseApi } from '../api/exophase';
import { PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT } from '../i18n';

const PROGRESS_POLL_MS = 1500;
const EXOPHASE_URL = 'https://www.exophase.com/account/#social';

/** Exophase sync: link a public Exophase profile, then sync the libraries Exophase has gathered
 * (PlayStation, Xbox, Steam, Epic, GOG and more) - no desktop app needed. Nothing secret is entered:
 * a profile link, name or id is all it takes. */
export function ExophaseDialog() {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<LibrarySyncProgress | null>(null);

  const { data: status } = useQuery({ queryKey: EXOPHASE_STATUS_QUERY_KEY, queryFn: exophaseApi.status });
  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: EXOPHASE_STATUS_QUERY_KEY });
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : t('settings.exophase.error'));

  const connect = useMutation({
    mutationFn: (value: string) => exophaseApi.connect(value),
    onSuccess: () => {
      setError(null);
      setProfile('');
      void refreshStatus();
      ui.notify(t('settings.exophase.connected'));
    },
    onError: fail,
  });

  // While a sync runs, show how far it has got, and refresh the library once it finishes.
  useEffect(() => {
    if (!syncing) return;
    const timer = window.setInterval(async () => {
      try {
        const { progress: p } = await exophaseApi.progress();
        if (!p) return;
        setProgress(p);
        if (p.done) {
          window.clearInterval(timer);
          setSyncing(false);
          void refreshStatus();
          queryClient.invalidateQueries({ queryKey: ['games'] });
          queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
          ui.notify(t('settings.exophase.syncDone', { matched: p.matched, unmatched: p.unmatched }));
        }
      } catch {
        // A missed poll just means the next one shows the numbers.
      }
    }, PROGRESS_POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing]);

  const sync = useMutation({
    mutationFn: exophaseApi.sync,
    onSuccess: () => {
      setError(null);
      setProgress(null);
      setSyncing(true);
    },
    onError: fail,
  });

  const disconnect = useMutation({
    mutationFn: exophaseApi.disconnect,
    onSuccess: () => {
      void refreshStatus();
      ui.notify(t('settings.exophase.disconnected'));
    },
    onError: fail,
  });

  async function confirmDisconnect() {
    const ok = await confirm({ title: t('settings.exophase.disconnectTitle'), message: t('settings.exophase.disconnectMessage'), confirmLabel: t('settings.exophase.disconnect'), danger: true });
    if (ok) disconnect.mutate();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (profile.trim()) connect.mutate(profile.trim());
  }

  const steps = [
    { t: t('settings.exophase.step1Title'), d: t('settings.exophase.step1Body'), link: [t('settings.exophase.step1Link'), EXOPHASE_URL] as const },
    { t: t('settings.exophase.step2Title'), d: t('settings.exophase.step2Body') },
    { t: t('settings.exophase.step3Title'), d: t('settings.exophase.step3Body') },
  ];

  return (
    <Dialog onClose={() => ui.closeDialog('exophase')} title={t('settings.exophase.title')} gap={16}>
      {error && <Banner>{error}</Banner>}
      {!status ? (
        <span style={st('color:var(--muted);font-size:14px')}>{t('common.loading')}</span>
      ) : status.connected ? (
        <div style={st('display:flex;flex-direction:column;gap:14px')}>
          <div style={st('display:flex;flex-direction:column;gap:4px')}>
            <span style={st('font:700 20px var(--font-display)')}>{t('settings.exophase.linkedAs', { id: status.playerId ?? '' })}</span>
            <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
              {status.lastSyncedAt ? t('settings.exophase.lastSynced', { when: formatRelativeTime(status.lastSyncedAt) }) : t('settings.exophase.neverSynced')}
            </span>
          </div>
          <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.exophase.syncHint')}</span>
          {progress && (
            <span style={st('font:500 13.5px var(--font-ui)')}>
              {syncing
                ? t('settings.exophase.progress', { done: progress.matched + progress.unmatched + progress.errored, total: progress.consideredCount })
                : t('settings.exophase.syncDone', { matched: progress.matched, unmatched: progress.unmatched })}
            </span>
          )}
          <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
            <Btn kind="accent" height={44} padX={18} disabled={syncing || sync.isPending} onClick={() => sync.mutate()}>
              {syncing || sync.isPending ? t('settings.exophase.syncing') : t('settings.exophase.syncNow')}
            </Btn>
            <Btn height={44} padX={18} disabled={disconnect.isPending} onClick={() => void confirmDisconnect()}>
              {t('settings.exophase.disconnect')}
            </Btn>
          </div>
        </div>
      ) : (
        <>
          {steps.map((s, i) => (
            <div key={s.t} style={st('display:flex;gap:12px')}>
              <span style={st('width:28px;height:28px;flex-shrink:0;border-radius:50%;background:var(--chip);display:flex;align-items:center;justify-content:center;font:700 13px var(--font-ui)')}>{i + 1}</span>
              <span style={st('flex:1;display:flex;flex-direction:column;gap:6px;padding-top:4px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{s.t}</span>
                <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{s.d}</span>
                {s.link && (
                  <a
                    href={s.link[1]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={st('align-self:flex-start;display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 13px var(--font-ui);text-decoration:none')}
                  >
                    {s.link[0]}
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </span>
            </div>
          ))}
          <form onSubmit={submit} style={st('display:flex;gap:8px')}>
            <input
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder={t('settings.exophase.placeholder')}
              aria-label={t('settings.exophase.aria')}
              autoFocus
              style={st(`flex:1;min-width:0;${inputPill}`)}
            />
            <Btn kind="accent" height={44} padX={18} disabled={connect.isPending || !profile.trim()} onClick={() => profile.trim() && connect.mutate(profile.trim())}>
              {connect.isPending ? '…' : t('settings.exophase.link')}
            </Btn>
          </form>
          <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.exophase.note')}</span>
        </>
      )}
    </Dialog>
  );
}
