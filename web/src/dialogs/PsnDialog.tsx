import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibrarySyncProgress } from '@queueup/shared';
import { PSN_STATUS_QUERY_KEY, psnApi } from '../api/psn';
import { PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT } from '../i18n';

const PROGRESS_POLL_MS = 1500;
const PLAYSTATION_URL = 'https://www.playstation.com/';
const SSOCOOKIE_URL = 'https://ca.account.sony.com/api/v1/ssocookie';
/** Warn once the saved login has under this long left. */
const EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000;

/** A bookmark that, clicked on Sony's cookie page, copies the NPSSO to the clipboard - so nobody has to
 * select the code out of the JSON by hand. It only reads the page it is clicked on and never sends
 * anything anywhere. (React won't render a javascript: href, so it is set on the element directly.) */
const COPY_BOOKMARKLET =
  "javascript:(function(){try{var t=JSON.parse(document.body.innerText).npsso;if(!t)throw 0;" +
  "navigator.clipboard.writeText(t).then(function(){alert('Your NPSSO code is copied. Go back to QueueUp and paste it.')}," +
  "function(){prompt('Copy this code:',t)})}catch(e){alert('Open the PlayStation cookie page while signed in to playstation.com, then click this again.')}})()";

/** PlayStation sync: link an account with a one-off NPSSO code, then sync the purchased PS4 and PS5
 * games - no Playnite in between. QueueUp trades the code for a limited login straight away and
 * never stores the code itself. */
export function PsnDialog() {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [npsso, setNpsso] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<LibrarySyncProgress | null>(null);
  const bookmarkRef = useRef<HTMLAnchorElement | null>(null);

  const { data: status } = useQuery({ queryKey: PSN_STATUS_QUERY_KEY, queryFn: psnApi.status });
  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: PSN_STATUS_QUERY_KEY });
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : t('settings.psn.error'));

  // The bookmark is only on screen while linking; set its address when it appears.
  useEffect(() => {
    bookmarkRef.current?.setAttribute('href', COPY_BOOKMARKLET);
  });

  const connect = useMutation({
    mutationFn: (value: string) => psnApi.connect(value),
    onSuccess: () => {
      setError(null);
      setNpsso('');
      void refreshStatus();
      ui.notify(t('settings.psn.connected'));
    },
    onError: fail,
  });

  // While a sync runs, show how far it has got, and refresh the library once it finishes.
  useEffect(() => {
    if (!syncing) return;
    const timer = window.setInterval(async () => {
      try {
        const { progress: p } = await psnApi.progress();
        if (!p) return;
        setProgress(p);
        if (p.done) {
          window.clearInterval(timer);
          setSyncing(false);
          void refreshStatus();
          queryClient.invalidateQueries({ queryKey: ['games'] });
          queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
          ui.notify(t('settings.psn.syncDone', { matched: p.matched, unmatched: p.unmatched }));
        }
      } catch {
        // A missed poll just means the next one shows the numbers.
      }
    }, PROGRESS_POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing]);

  const sync = useMutation({
    mutationFn: psnApi.sync,
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
    mutationFn: psnApi.disconnect,
    onSuccess: () => {
      void refreshStatus();
      ui.notify(t('settings.psn.disconnected'));
    },
    onError: fail,
  });

  async function confirmDisconnect() {
    const ok = await confirm({ title: t('settings.psn.disconnectTitle'), message: t('settings.psn.disconnectMessage'), confirmLabel: t('settings.psn.disconnect'), danger: true });
    if (ok) disconnect.mutate();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (npsso.trim()) connect.mutate(npsso.trim());
  }

  const linkStyle = 'align-self:flex-start;display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 13px var(--font-ui);text-decoration:none';
  const expiresAt = status?.linkExpiresAt ? new Date(status.linkExpiresAt) : null;
  const expiringSoon = expiresAt !== null && expiresAt.getTime() - Date.now() < EXPIRY_WARNING_MS;

  return (
    <Dialog onClose={() => ui.closeDialog('psn')} title={t('settings.psn.title')} gap={16}>
      {error && <Banner>{error}</Banner>}
      {!status ? (
        <span style={st('color:var(--muted);font-size:14px')}>{t('common.loading')}</span>
      ) : status.connected ? (
        <div style={st('display:flex;flex-direction:column;gap:14px')}>
          <div style={st('display:flex;flex-direction:column;gap:4px')}>
            <span style={st('font:700 20px var(--font-display)')}>{t('settings.psn.linked')}</span>
            <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
              {status.lastSyncedAt ? t('settings.psn.lastSynced', { when: formatRelativeTime(status.lastSyncedAt) }) : t('settings.psn.neverSynced')}
            </span>
            {expiresAt && (
              <span style={st(`font:${expiringSoon ? 600 : 400} 13px var(--font-ui);color:${expiringSoon ? 'var(--danger)' : 'var(--muted)'}`)}>
                {expiringSoon ? t('settings.psn.expiresSoon', { date: expiresAt.toLocaleDateString() }) : t('settings.psn.expires', { date: expiresAt.toLocaleDateString() })}
              </span>
            )}
          </div>
          <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.psn.syncHint')}</span>
          {progress && (
            <span style={st('font:500 13.5px var(--font-ui)')}>
              {syncing
                ? t('settings.psn.progress', { done: progress.matched + progress.unmatched + progress.errored, total: progress.consideredCount })
                : t('settings.psn.syncDone', { matched: progress.matched, unmatched: progress.unmatched })}
            </span>
          )}
          <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
            <Btn kind="accent" height={44} padX={18} disabled={syncing || sync.isPending} onClick={() => sync.mutate()}>
              {syncing || sync.isPending ? t('settings.psn.syncing') : t('settings.psn.syncNow')}
            </Btn>
            <Btn height={44} padX={18} disabled={disconnect.isPending} onClick={() => void confirmDisconnect()}>
              {t('settings.psn.disconnect')}
            </Btn>
          </div>
        </div>
      ) : (
        <>
          <div style={st('display:flex;gap:12px')}>
            <span style={st('width:28px;height:28px;flex-shrink:0;border-radius:50%;background:var(--chip);display:flex;align-items:center;justify-content:center;font:700 13px var(--font-ui)')}>1</span>
            <span style={st('flex:1;display:flex;flex-direction:column;gap:6px;padding-top:4px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{t('settings.psn.step1Title')}</span>
              <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.psn.step1Body')}</span>
              <a href={PLAYSTATION_URL} target="_blank" rel="noopener noreferrer" style={st(linkStyle)}>
                {t('settings.psn.step1Link')}
                <span aria-hidden="true">↗</span>
              </a>
            </span>
          </div>
          <div style={st('display:flex;gap:12px')}>
            <span style={st('width:28px;height:28px;flex-shrink:0;border-radius:50%;background:var(--chip);display:flex;align-items:center;justify-content:center;font:700 13px var(--font-ui)')}>2</span>
            <span style={st('flex:1;display:flex;flex-direction:column;gap:6px;padding-top:4px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{t('settings.psn.step2Title')}</span>
              <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.psn.step2Body')}</span>
              <a href={SSOCOOKIE_URL} target="_blank" rel="noopener noreferrer" style={st(linkStyle)}>
                {t('settings.psn.step2Link')}
                <span aria-hidden="true">↗</span>
              </a>
            </span>
          </div>
          <div style={st('display:flex;gap:12px')}>
            <span style={st('width:28px;height:28px;flex-shrink:0;border-radius:50%;background:var(--chip);display:flex;align-items:center;justify-content:center;font:700 13px var(--font-ui)')}>3</span>
            <span style={st('flex:1;display:flex;flex-direction:column;gap:6px;padding-top:4px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{t('settings.psn.step3Title')}</span>
              <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.psn.step3Body')}</span>
              <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.psn.bookmarkHint')}</span>
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid -- the address is a bookmarklet, set in an effect */}
              <a ref={bookmarkRef} onClick={(e) => e.preventDefault()} draggable style={st(linkStyle)}>
                {t('settings.psn.bookmarkLabel')}
              </a>
            </span>
          </div>
          <form onSubmit={submit} style={st('display:flex;gap:8px')}>
            <input
              value={npsso}
              onChange={(e) => setNpsso(e.target.value)}
              placeholder={t('settings.psn.placeholder')}
              aria-label={t('settings.psn.aria')}
              autoComplete="off"
              spellCheck={false}
              style={st(`flex:1;min-width:0;${inputPill};font-family:var(--font-mono)`)}
            />
            <Btn kind="accent" height={44} padX={18} disabled={connect.isPending || !npsso.trim()} onClick={() => npsso.trim() && connect.mutate(npsso.trim())}>
              {connect.isPending ? '…' : t('settings.psn.link')}
            </Btn>
          </form>
          <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.psn.safety')}</span>
          <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.psn.note')}</span>
        </>
      )}
    </Dialog>
  );
}
