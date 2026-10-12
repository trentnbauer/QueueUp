import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { itchImportApi } from '../api/itchImport';
import { PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const POLL_MS = 1000;
const ITCH_KEYS_URL = 'https://itch.io/user/settings/api-keys';

/** One-shot itch.io import (issue #1047): paste a personal API key, QueueUp reads the games you own
 * and matches them like any other library. The key is used for that one request and not kept. */
export function ItchImportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAfter, setStartedAfter] = useState<number | null>(null);

  async function start(e?: FormEvent) {
    e?.preventDefault();
    if (!apiKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const startedAt = Date.now();
      await itchImportApi.start(apiKey.trim());
      setApiKey('');
      setStartedAfter(startedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.itchImport.failed'));
    } finally {
      setBusy(false);
    }
  }

  const running = startedAfter !== null;
  const { data } = useQuery({
    queryKey: ['itch-import', 'progress'],
    queryFn: itchImportApi.progress,
    enabled: running,
    refetchInterval: (q) => (q.state.data?.progress?.done ? false : POLL_MS),
  });
  // Ignore a leftover row from an earlier import until this run has written its own.
  const progress = data?.progress && Date.parse(data.progress.startedAt) >= (startedAfter ?? 0) - 5000 ? data.progress : null;
  const done = !!progress?.done;
  useEffect(() => {
    if (!done) return;
    void queryClient.invalidateQueries({ queryKey: ['games'] });
    void queryClient.invalidateQueries({ queryKey: PENDING_IMPORTS_QUERY_KEY });
  }, [done, queryClient]);

  return (
    <Dialog onClose={onClose} title={t('add.itchImport.title')} gap={16}>
      {error && <Banner>{error}</Banner>}
      {running ? (
        <div style={st('display:flex;flex-direction:column;gap:10px')}>
          <span style={st('font:700 18px var(--font-display)')}>{done ? t('add.fileImport.done') : t('add.fileImport.running')}</span>
          {progress && (
            <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
              {t(done ? 'add.fileImport.doneBody' : 'add.fileImport.progress', { matched: progress.matched, unmatched: progress.unmatched, total: progress.consideredCount })}
            </span>
          )}
          {done && (
            <Btn kind="text" height={46} weight={700} onClick={onClose}>
              {t('add.fileImport.finish')}
            </Btn>
          )}
        </div>
      ) : (
        <>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('add.itchImport.intro')}</span>
          <a
            href={ITCH_KEYS_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={st('align-self:flex-start;display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 13px var(--font-ui);text-decoration:none')}
          >
            {t('add.itchImport.keyLink')}
            <span aria-hidden="true">↗</span>
          </a>
          <form onSubmit={(e) => void start(e)} style={st('display:flex;gap:8px')}>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('add.itchImport.placeholder')}
              aria-label={t('add.itchImport.aria')}
              autoFocus
              style={st(`flex:1;min-width:0;${inputPill}`)}
            />
            <Btn kind="accent" height={44} padX={18} disabled={busy || !apiKey.trim()} onClick={() => void start()}>
              {busy ? '…' : t('add.itchImport.import')}
            </Btn>
          </form>
          <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('add.itchImport.note')}</span>
        </>
      )}
    </Dialog>
  );
}
