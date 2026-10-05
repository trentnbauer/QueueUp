import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibrarySyncProgress, XboxConnectStartResponse } from '@queueup/shared';
import { XBOX_STATUS_QUERY_KEY, xboxApi } from '../api/xbox';
import { PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT } from '../i18n';

const PROGRESS_POLL_MS = 1500;

/** Native Xbox sync: link a Microsoft account with the device-code login (open a link, type a short
 * code), then sync the Xbox library into QueueUp - no Playnite in between. The Microsoft login
 * itself never reaches the browser; this only ever sees the short code and whether it's linked. */
export function XboxDialog() {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<XboxConnectStartResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<LibrarySyncProgress | null>(null);

  const { data: status } = useQuery({ queryKey: XBOX_STATUS_QUERY_KEY, queryFn: xboxApi.status });
  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: XBOX_STATUS_QUERY_KEY });
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : t('settings.xbox.error'));

  const connect = useMutation({
    mutationFn: xboxApi.connect,
    onSuccess: (next) => {
      setError(null);
      setCode(next);
    },
    onError: fail,
  });

  // While a code is showing, ask the server every few seconds whether the person has approved it.
  const poll = useRef(xboxApi.poll);
  useEffect(() => {
    if (!code) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const result = await poll.current();
        if (stopped || result.status === 'pending') return;
        window.clearInterval(timer);
        setCode(null);
        if (result.status === 'connected') {
          ui.notify(t('settings.xbox.connected'));
          void refreshStatus();
        } else {
          setError(result.status === 'declined' ? t('settings.xbox.declined') : t('settings.xbox.expired'));
        }
      } catch (e) {
        window.clearInterval(timer);
        setCode(null);
        fail(e);
      }
    }, Math.max(3, code.interval) * 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // While a sync runs, show how far it has got, and refresh the library once it finishes.
  useEffect(() => {
    if (!syncing) return;
    const timer = window.setInterval(async () => {
      try {
        const { progress: p } = await xboxApi.progress();
        if (!p) return;
        setProgress(p);
        if (p.done) {
          window.clearInterval(timer);
          setSyncing(false);
          void refreshStatus();
          queryClient.invalidateQueries({ queryKey: ['games'] });
          queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
          ui.notify(t('settings.xbox.syncDone', { matched: p.matched, unmatched: p.unmatched }));
        }
      } catch {
        // A missed poll just means the next one shows the numbers.
      }
    }, PROGRESS_POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing]);

  const sync = useMutation({
    mutationFn: xboxApi.sync,
    onSuccess: () => {
      setError(null);
      setProgress(null);
      setSyncing(true);
    },
    onError: (e) => {
      fail(e);
      void refreshStatus();
    },
  });

  const disconnect = useMutation({
    mutationFn: xboxApi.disconnect,
    onSuccess: () => {
      setCode(null);
      void refreshStatus();
      ui.notify(t('settings.xbox.disconnected'));
    },
    onError: fail,
  });

  async function confirmDisconnect() {
    const ok = await confirm({ title: t('settings.xbox.disconnectTitle'), message: t('settings.xbox.disconnectMessage'), confirmLabel: t('settings.xbox.disconnect'), danger: true });
    if (ok) disconnect.mutate();
  }

  const close = () => ui.closeDialog('xbox');
  const steps = [
    { t: t('settings.xbox.step1Title'), d: t('settings.xbox.step1Body') },
    { t: t('settings.xbox.step2Title'), d: t('settings.xbox.step2Body') },
    { t: t('settings.xbox.step3Title'), d: t('settings.xbox.step3Body') },
  ];

  return (
    <Dialog onClose={close} title={t('settings.xbox.title')} gap={16}>
      {error && <Banner>{error}</Banner>}
      {!status ? (
        <span style={st('color:var(--muted);font-size:14px')}>{t('common.loading')}</span>
      ) : !status.configured ? (
        <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.xbox.notConfigured')}</span>
      ) : status.connected ? (
        <div style={st('display:flex;flex-direction:column;gap:14px')}>
          <div style={st('display:flex;flex-direction:column;gap:4px')}>
            <span style={st('font:700 20px var(--font-display)')}>{t('settings.xbox.linkedAs', { name: status.gamertag ?? 'Xbox' })}</span>
            <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
              {status.lastSyncedAt ? t('settings.xbox.lastSynced', { when: formatRelativeTime(status.lastSyncedAt) }) : t('settings.xbox.neverSynced')}
            </span>
          </div>
          <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.xbox.syncHint')}</span>
          {progress && (
            <span style={st('font:500 13.5px var(--font-ui)')}>
              {syncing
                ? t('settings.xbox.progress', { done: progress.matched + progress.unmatched + progress.errored, total: progress.consideredCount })
                : t('settings.xbox.syncDone', { matched: progress.matched, unmatched: progress.unmatched })}
            </span>
          )}
          <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
            <Btn kind="accent" height={44} padX={18} disabled={syncing || sync.isPending} onClick={() => sync.mutate()}>
              {syncing || sync.isPending ? t('settings.xbox.syncing') : t('settings.xbox.syncNow')}
            </Btn>
            <Btn height={44} padX={18} disabled={disconnect.isPending} onClick={() => void confirmDisconnect()}>
              {t('settings.xbox.disconnect')}
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
              </span>
            </div>
          ))}
          {code ? (
            <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:16px;background:var(--surf)')}>
              <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{t('settings.xbox.yourCode')}</span>
              <span style={st('font:700 28px var(--font-mono);letter-spacing:0.12em')}>{code.userCode}</span>
              <a
                href={code.verificationUri}
                target="_blank"
                rel="noopener noreferrer"
                style={st('align-self:flex-start;display:flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 13px var(--font-ui);text-decoration:none')}
              >
                {t('settings.xbox.openLink')}
                <span aria-hidden="true">↗</span>
              </a>
              <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('settings.xbox.waiting')}</span>
            </div>
          ) : (
            <Btn kind="accent" height={46} disabled={connect.isPending} onClick={() => connect.mutate()}>
              {connect.isPending ? '…' : t('settings.xbox.getCode')}
            </Btn>
          )}
        </>
      )}
    </Dialog>
  );
}
