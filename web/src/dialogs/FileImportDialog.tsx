import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, type LibraryFileMapping, type LibraryFilePreview, type RoomPlatform } from '@queueup/shared';
import { libraryFileImportApi } from '../api/libraryFileImport';
import { PENDING_IMPORTS_QUERY_KEY } from '../api/pendingImports';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const POLL_MS = 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const selectStyle = st(`${inputPill};max-width:100%`);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={st('display:flex;flex-direction:column;gap:6px')}>
      <span style={st('font:600 13px var(--font-ui)')}>{label}</span>
      {children}
    </label>
  );
}

/** Import a library from a CSV or JSON file (issue #1047): pick the file, say which column is which,
 * and the titles go through the same matching as every other import, with the ones that can't be
 * matched waiting in Needs matching. Google Play Takeout files are recognised and need no mapping. */
export function FileImportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<LibraryFilePreview | null>(null);
  const [mapping, setMapping] = useState<LibraryFileMapping | null>(null);
  const [busy, setBusy] = useState(false);
  const [startedAfter, setStartedAfter] = useState<number | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(t('add.fileImport.tooBig'));
      return;
    }
    setBusy(true);
    try {
      const content = await file.text();
      const result = await libraryFileImportApi.preview(content);
      setText(content);
      setFileName(file.name);
      setPreview(result);
      setMapping(result.suggested);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('add.fileImport.readFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!text || !mapping) return;
    setBusy(true);
    setError(null);
    try {
      const startedAt = Date.now();
      await libraryFileImportApi.start(text, mapping);
      setStartedAfter(startedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('add.fileImport.startFailed'));
    } finally {
      setBusy(false);
    }
  }

  const running = startedAfter !== null;
  const { data } = useQuery({
    queryKey: ['library-file-import', 'progress'],
    queryFn: libraryFileImportApi.progress,
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

  const update = (patch: Partial<LibraryFileMapping>) => setMapping((m) => (m ? { ...m, ...patch } : m));

  return (
    <Dialog onClose={onClose} title={t('add.fileImport.title')} gap={16}>
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
      ) : !preview || !mapping ? (
        <>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('add.fileImport.intro')}</span>
          <input
            type="file"
            accept=".csv,.tsv,.txt,.json,text/csv,application/json,text/plain"
            disabled={busy}
            aria-label={t('add.fileImport.choose')}
            onChange={(e) => void choose(e.target.files?.[0])}
            style={st('font:500 14px var(--font-ui)')}
          />
          <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('add.fileImport.formats')}</span>
        </>
      ) : (
        <>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
            {preview.format === 'google_play' ? t('add.fileImport.googlePlay', { count: preview.rowCount }) : t('add.fileImport.found', { name: fileName, count: preview.rowCount })}
          </span>
          {preview.format !== 'google_play' && (
            <>
              <Field label={t('add.fileImport.titleColumn')}>
                <select value={mapping.titleColumn} onChange={(e) => update({ titleColumn: e.target.value })} style={selectStyle}>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('add.fileImport.platformColumn')}>
                <select value={mapping.platformColumn ?? ''} onChange={(e) => update({ platformColumn: e.target.value || null })} style={selectStyle}>
                  <option value="">{t('add.fileImport.noColumn')}</option>
                  {preview.columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label={mapping.platformColumn ? t('add.fileImport.fallbackPlatform') : t('add.fileImport.platform')}>
            <select value={mapping.defaultPlatform} onChange={(e) => update({ defaultPlatform: e.target.value as RoomPlatform })} style={selectStyle}>
              {Object.entries(ROOM_PLATFORM_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </Field>
          {preview.format !== 'google_play' && (
            <div style={st('display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:14px;background:var(--surf);font:400 12.5px var(--font-ui)')}>
              <span style={st('font:600 12px var(--font-ui);color:var(--muted)')}>{t('add.fileImport.sample')}</span>
              {preview.sampleRows.map((row, i) => (
                <span key={i} style={st('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>
                  {row[mapping.titleColumn] || '-'}
                  {mapping.platformColumn ? ` - ${row[mapping.platformColumn] || '-'}` : ''}
                </span>
              ))}
            </div>
          )}
          <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('add.fileImport.note')}</span>
          <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
            <Btn kind="accent" height={44} padX={18} disabled={busy} onClick={() => void start()}>
              {busy ? '…' : t('add.fileImport.import', { count: preview.rowCount })}
            </Btn>
            <Btn height={44} padX={18} disabled={busy} onClick={() => { setPreview(null); setMapping(null); setText(null); }}>
              {t('add.fileImport.otherFile')}
            </Btn>
          </div>
        </>
      )}
    </Dialog>
  );
}
