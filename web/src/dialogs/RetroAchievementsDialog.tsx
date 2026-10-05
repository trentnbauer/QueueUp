import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibrarySyncProgress } from '@queueup/shared';
import { COMPLETION_SUGGESTIONS_QUERY_KEY, RETROACHIEVEMENTS_STATUS_QUERY_KEY, retroAchievementsApi } from '../api/retroachievements';
import { PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useLibraryLimits } from '../hooks/useLibraryLimits';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT } from '../i18n';

const PROGRESS_POLL_MS = 1500;
const RA_SETTINGS_URL = 'https://retroachievements.org/settings';

/** Games a sync says are finished, waiting for a yes: nothing is marked Beaten until it is approved here. */
function FinishedGames() {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const { ops } = useScope();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: COMPLETION_SUGGESTIONS_QUERY_KEY, queryFn: retroAchievementsApi.completionSuggestions });
  const suggestions = data?.suggestions ?? [];
  if (suggestions.length === 0) return null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: COMPLETION_SUGGESTIONS_QUERY_KEY });

  async function markBeaten(ids: string[]) {
    setBusy(true);
    try {
      await ops.bulkUpdateStatus(ids, 'done');
      ui.notify(t('add.completions.marked', { n: ids.length }));
      void refresh();
    } catch {
      /* the games hook surfaces the failure itself */
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: string) {
    setBusy(true);
    try {
      await retroAchievementsApi.dismissCompletionSuggestion(id);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:16px;background:var(--surf)')}>
      <span style={st('font:600 14.5px var(--font-ui)')}>{t('settings.ra.finished.title', { n: suggestions.length })}</span>
      <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.ra.finished.hint')}</span>
      {suggestions.map((s) => (
        <div key={s.id} style={st('display:flex;align-items:center;gap:8px')}>
          <span style={st('flex:1;min-width:0;font:500 13.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{s.title}</span>
          <Btn height={32} padX={12} fontSize={12.5} disabled={busy} onClick={() => void markBeaten([s.id])}>
            {t('settings.ra.finished.mark')}
          </Btn>
          <Btn kind="ghost" height={32} padX={10} fontSize={12.5} disabled={busy} onClick={() => void dismiss(s.id)}>
            {t('settings.ra.finished.dismiss')}
          </Btn>
        </div>
      ))}
      <Btn kind="accent" height={40} fontSize={13} disabled={busy} onClick={() => void markBeaten(suggestions.map((s) => s.id))}>
        {t('settings.ra.finished.markAll', { n: suggestions.length })}
      </Btn>
    </div>
  );
}

/** RetroAchievements sync: link a username and personal web API key, then sync the retro games on the
 * profile; the ones RetroAchievements says are beaten or mastered can be approved as Beaten here. The key
 * is stored encrypted and never shown again. */
export function RetroAchievementsDialog() {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const limits = useLibraryLimits();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<LibrarySyncProgress | null>(null);

  const { data: status } = useQuery({ queryKey: RETROACHIEVEMENTS_STATUS_QUERY_KEY, queryFn: retroAchievementsApi.status });
  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: RETROACHIEVEMENTS_STATUS_QUERY_KEY });
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : t('settings.ra.error'));

  const connect = useMutation({
    mutationFn: ({ name, key }: { name: string; key: string }) => retroAchievementsApi.connect(name, key),
    onSuccess: () => {
      setError(null);
      setApiKey('');
      void refreshStatus();
      ui.notify(t('settings.ra.connected'));
    },
    onError: fail,
  });

  // While a sync runs, show how far it has got, and refresh the library once it finishes.
  useEffect(() => {
    if (!syncing) return;
    const timer = window.setInterval(async () => {
      try {
        const { progress: p } = await retroAchievementsApi.progress();
        if (!p) return;
        setProgress(p);
        if (p.done) {
          window.clearInterval(timer);
          setSyncing(false);
          void refreshStatus();
          queryClient.invalidateQueries({ queryKey: ['games'] });
          queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
          ui.notify(t('settings.ra.syncDone', { matched: p.matched, unmatched: p.unmatched }));
        }
      } catch {
        // A missed poll just means the next one shows the numbers.
      }
    }, PROGRESS_POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing]);

  const sync = useMutation({
    mutationFn: retroAchievementsApi.sync,
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
    mutationFn: retroAchievementsApi.disconnect,
    onSuccess: () => {
      void refreshStatus();
      ui.notify(t('settings.ra.disconnected'));
    },
    onError: fail,
  });

  async function confirmDisconnect() {
    const ok = await confirm({ title: t('settings.ra.disconnectTitle'), message: t('settings.ra.disconnectMessage'), confirmLabel: t('settings.ra.disconnect'), danger: true });
    if (ok) disconnect.mutate();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (username.trim() && apiKey.trim()) connect.mutate({ name: username.trim(), key: apiKey.trim() });
  }

  const linkStyle = 'align-self:flex-start;display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 13px var(--font-ui);text-decoration:none';
  const steps = [
    { n: 1, title: t('settings.ra.step1Title'), body: t('settings.ra.step1Body'), link: t('settings.ra.step1Link') },
    { n: 2, title: t('settings.ra.step2Title'), body: t('settings.ra.step2Body') },
    { n: 3, title: t('settings.ra.step3Title'), body: t('settings.ra.step3Body') },
  ];

  return (
    <Dialog onClose={() => ui.closeDialog('retroachievements')} title={t('settings.ra.title')} gap={16}>
      {error && <Banner>{error}</Banner>}
      {!status ? (
        <span style={st('color:var(--muted);font-size:14px')}>{t('common.loading')}</span>
      ) : status.connected ? (
        <div style={st('display:flex;flex-direction:column;gap:14px')}>
          <div style={st('display:flex;flex-direction:column;gap:4px')}>
            <span style={st('font:700 20px var(--font-display)')}>{t('settings.ra.linkedAs', { name: status.username ?? '' })}</span>
            <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>
              {status.lastSyncedAt ? t('settings.ra.lastSynced', { when: formatRelativeTime(status.lastSyncedAt) }) : t('settings.ra.neverSynced')}
            </span>
          </div>
          <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.ra.syncHint')}</span>
          {progress && (
            <span style={st('font:500 13.5px var(--font-ui)')}>
              {syncing
                ? t('settings.ra.progress', { done: progress.matched + progress.unmatched + progress.errored, total: progress.consideredCount })
                : t('settings.ra.syncDone', { matched: progress.matched, unmatched: progress.unmatched })}
            </span>
          )}
          {limits.isLimited('retroachievements') && (
            <span style={st('font:500 13px/1.45 var(--font-ui);color:var(--danger)')}>{t('add.import.rateLimited', { minutes: limits.minutesLeft('retroachievements') ?? 1 })}</span>
          )}
          <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
            <Btn kind="accent" height={44} padX={18} disabled={syncing || sync.isPending || limits.isLimited('retroachievements')} onClick={() => sync.mutate()}>
              {syncing || sync.isPending ? t('settings.ra.syncing') : t('settings.ra.syncNow')}
            </Btn>
            <Btn height={44} padX={18} disabled={disconnect.isPending} onClick={() => void confirmDisconnect()}>
              {t('settings.ra.disconnect')}
            </Btn>
          </div>
          <FinishedGames />
        </div>
      ) : (
        <>
          {steps.map((s) => (
            <div key={s.n} style={st('display:flex;gap:12px')}>
              <span style={st('width:28px;height:28px;flex-shrink:0;border-radius:50%;background:var(--chip);display:flex;align-items:center;justify-content:center;font:700 13px var(--font-ui)')}>{s.n}</span>
              <span style={st('flex:1;display:flex;flex-direction:column;gap:6px;padding-top:4px')}>
                <span style={st('font:600 14.5px var(--font-ui)')}>{s.title}</span>
                <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{s.body}</span>
                {s.link && (
                  <a href={RA_SETTINGS_URL} target="_blank" rel="noopener noreferrer" style={st(linkStyle)}>
                    {s.link}
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </span>
            </div>
          ))}
          <form onSubmit={submit} style={st('display:flex;flex-direction:column;gap:8px')}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('settings.ra.usernamePlaceholder')}
              aria-label={t('settings.ra.usernameAria')}
              autoComplete="username"
              style={st(`min-width:0;${inputPill}`)}
            />
            <div style={st('display:flex;gap:8px')}>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('settings.ra.keyPlaceholder')}
                aria-label={t('settings.ra.keyAria')}
                type="password"
                autoComplete="off"
                spellCheck={false}
                style={st(`flex:1;min-width:0;${inputPill};font-family:var(--font-mono)`)}
              />
              <Btn kind="accent" height={44} padX={18} disabled={connect.isPending || !username.trim() || !apiKey.trim()} onClick={() => connect.mutate({ name: username.trim(), key: apiKey.trim() })}>
                {connect.isPending ? '…' : t('settings.ra.link')}
              </Btn>
            </div>
          </form>
          <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.ra.safety')}</span>
        </>
      )}
    </Dialog>
  );
}
