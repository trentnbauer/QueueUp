import { useEffect, useState } from 'react';
import { AI_BENCHMARK_STEPS, AI_MAX_FALLBACKS, AI_RECOMMENDED_MODELS, summariseBenchmark, type AiBenchmarkResult, type AiBenchmarkStep, type AiModelsRequest, type AiModelsResponse, type AiFallbackEntry, type AiFallbackInput, type AiFallbackNotice, type AiProvider } from '@queueup/shared';
import { Banner, Btn, Group } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

/** One provider being edited. `apiKey` is only what was typed this time: empty keeps the saved key. */
export interface AiDraft {
  id?: string;
  provider: AiProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  /** Switched off: kept saved, but not used. */
  disabled: boolean;
  /** Already saved on the server, so it can be tested and starts folded away. */
  saved: boolean;
}

export const emptyAiDraft = (provider: AiProvider = 'anthropic'): AiDraft => ({ provider, model: '', baseUrl: '', apiKey: '', hasApiKey: false, disabled: false, saved: false });

export const draftFromEntry = (e: { id?: string; provider: AiProvider; model: string | null; baseUrl: string | null; hasApiKey: boolean; disabled?: boolean }): AiDraft => ({
  id: e.id,
  provider: e.provider,
  model: e.model ?? '',
  baseUrl: e.baseUrl ?? '',
  apiKey: '',
  hasApiKey: e.hasApiKey,
  disabled: !!e.disabled,
  saved: true,
});

export const draftToInput = (d: AiDraft): AiFallbackInput => ({
  id: d.id,
  provider: d.provider,
  model: d.model.trim() || null,
  baseUrl: d.baseUrl.trim() || null,
  apiKey: d.apiKey.trim() || undefined,
  disabled: d.disabled,
});

export const fallbacksFromEntries = (list: AiFallbackEntry[]): AiDraft[] => list.map(draftFromEntry);

const FIELD = 'height:40px;padding:0 12px;border-radius:12px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-size:14px;outline:none;min-width:0;width:100%;box-sizing:border-box';

/** A provider's name in the picker. */
const providerLabel = (t: ReturnType<typeof useT>, p: AiProvider) => t(`settings.ai.providerName.${p}` as MessageKey);

/** A running or finished benchmark of one entry: the steps so far, and which one is under way. */
interface BenchState {
  running: AiBenchmarkStep | null;
  results: AiBenchmarkResult[];
}

function BenchmarkPanel({ state }: { state: BenchState }) {
  const t = useT();
  const done = state.running === null;
  const summary = done ? summariseBenchmark(state.results) : null;
  const failure = state.results.find((r) => !r.ok);
  const detail =
    summary &&
    t(`settings.ai.benchmark.verdict.${summary.verdict}` as MessageKey, {
      seconds: summary.batchSeconds ?? '',
      minutes: summary.bigScanMinutes ?? '',
      error: failure?.error ?? t('settings.ai.benchmark.notJson'),
    });
  const color = summary ? (summary.verdict === 'good' ? 'var(--mint)' : summary.verdict === 'ok' ? 'var(--text)' : 'var(--danger)') : 'var(--muted)';
  return (
    <div style={st('display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:12px;background:var(--bg);border:1px solid var(--line)')}>
      {AI_BENCHMARK_STEPS.map((step) => {
        const r = state.results.find((x) => x.step === step);
        const active = state.running === step;
        return (
          <div key={step} style={st('display:flex;align-items:center;gap:8px;font:400 12.5px var(--font-ui);color:var(--text2)')}>
            <span style={st('flex:1;min-width:0')}>{t(`settings.ai.benchmark.step.${step}` as MessageKey)}</span>
            {active && <span role="status" aria-label={t('settings.ai.benchmarking')} style={st('width:14px;height:14px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--acc);animation:qu-spin .9s linear infinite')} />}
            {r && (
              <span style={st(`font:600 12.5px var(--font-mono);color:${r.ok ? 'var(--text)' : 'var(--danger)'}`)}>
                {r.ok ? `${(r.ms / 1000).toFixed(1)}s${r.tokensPerSecond !== null ? ` · ${r.tokensPerSecond} tok/s` : ''}` : r.timedOut ? t('settings.ai.benchmark.timedOut') : '⚠'}
              </span>
            )}
          </div>
        );
      })}
      {summary && <span style={st(`font:600 13px/1.4 var(--font-ui);color:${color};text-wrap:pretty;overflow-wrap:anywhere`)}>{detail}</span>}
    </div>
  );
}

/** The outcome of testing one entry. */
export type AiEntryTest = { ok: true } | { ok: false; message: string };

/** The first provider and its backups, in the order they're tried. Used by both the personal
 * settings dialog and Administrator settings. `locked` pins parts of the first entry that a Docker
 * env var sets, so they show but can't be edited here. Saved entries start folded to one line; each
 * has its own Test button, and a warning mark when its last test failed. */
export function AiProvidersEditor({
  drafts,
  onChange,
  providers,
  allowBaseUrl,
  locked,
  onTest,
  testing,
  results,
  onBenchmark,
  onListModels,
}: {
  drafts: AiDraft[];
  onChange: (next: AiDraft[]) => void;
  providers: AiProvider[];
  allowBaseUrl: boolean;
  locked?: { provider?: boolean; model?: boolean; baseUrl?: boolean; apiKey?: boolean };
  /** Tests the saved entry at this position. Left out, there are no Test buttons. */
  onTest?: (index: number) => void;
  /** Position of the entry being tested right now. */
  testing?: number | null;
  /** Last test result per position. */
  results?: Record<number, AiEntryTest>;
  /** Runs one timed benchmark step against the saved entry at this position. Left out, there is no Benchmark button. */
  onBenchmark?: (index: number, step: AiBenchmarkStep) => Promise<AiBenchmarkResult>;
  /** Asks the provider which models it offers (from what is on screen). Left out, there is no Load models button. */
  onListModels?: (body: AiModelsRequest) => Promise<AiModelsResponse>;
}) {
  const t = useT();
  // Models fetched from the provider, per entry, with any problem fetching them.
  const [modelLists, setModelLists] = useState<Record<string, { loading: boolean; models: string[] | null; error: string | null }>>({});
  async function loadModels(d: AiDraft, i: number, k: string) {
    if (!onListModels) return;
    setModelLists((prev) => ({ ...prev, [k]: { loading: true, models: prev[k]?.models ?? null, error: null } }));
    try {
      // The server reads this entry's saved address and key, so only saved entries can list models.
      const { models } = await onListModels({ index: i });
      setModelLists((prev) => ({ ...prev, [k]: { loading: false, models, error: models.length === 0 ? t('settings.ai.models.none') : null } }));
    } catch (e) {
      setModelLists((prev) => ({ ...prev, [k]: { loading: false, models: null, error: e instanceof Error ? e.message : t('settings.ai.models.failed') } }));
    }
  }
  const [bench, setBench] = useState<Record<number, BenchState>>({});
  const benchRunning = Object.values(bench).some((b) => b.running !== null);
  async function runBenchmark(i: number) {
    if (!onBenchmark) return;
    const results: AiBenchmarkResult[] = [];
    for (const step of AI_BENCHMARK_STEPS) {
      setBench((prev) => ({ ...prev, [i]: { running: step, results: [...results] } }));
      let r: AiBenchmarkResult;
      try {
        r = await onBenchmark(i, step);
      } catch (e) {
        r = { step, ok: false, ms: 0, outputTokens: null, tokensPerSecond: null, validJson: null, timedOut: false, error: e instanceof Error ? e.message : t('settings.ai.testFailed') };
      }
      results.push(r);
      if (!r.ok) break;
    }
    setBench((prev) => ({ ...prev, [i]: { running: null, results: [...results] } }));
  }
  // Entries the person has opened. A new, unsaved one is always open.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const keyOf = (d: AiDraft, i: number) => d.id ?? `pos-${i}`;
  // A saved entry with no model chosen yet fetches its model list straight away, so the dropdown is already there.
  useEffect(() => {
    if (!onListModels) return;
    drafts.forEach((d, i) => {
      const k = keyOf(d, i);
      if (d.saved && !d.model.trim() && !modelLists[k]) void loadModels(d, i, k);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts.length, onListModels]);
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const set = (i: number, patch: Partial<AiDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...drafts];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <Group>
        {drafts.map((d, i) => {
          const lock = i === 0 ? (locked ?? {}) : {};
          const showUrl = allowBaseUrl || d.provider === 'ollama' || d.provider === 'openai_compatible' || !!d.baseUrl;
          const k = keyOf(d, i);
          const expanded = !d.saved || !d.model.trim() || open.has(k);
          const result = results?.[i];
          // Passed or failed, from the Test button or a finished Benchmark: any failure shows the warning,
          // otherwise any pass shows the green tick.
          const benchSummary = bench[i] && bench[i].running === null ? summariseBenchmark(bench[i].results) : null;
          const benchFailed = !!benchSummary && (benchSummary.verdict === 'failed' || benchSummary.verdict === 'tooSlow');
          const bad = (!!result && !result.ok) || benchFailed;
          const good = !bad && ((!!result && result.ok) || (!!benchSummary && !benchFailed));
          const summary = [providerLabel(t, d.provider), d.model.trim() || AI_RECOMMENDED_MODELS[d.provider], d.disabled ? t('settings.ai.disabledTag') : null].filter(Boolean).join(' · ');
          return (
            <div key={d.id ?? `new-${i}`} style={st(`display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:var(--surf);${d.disabled ? 'opacity:.7' : ''}`)}>
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px')}>
                <button
                  type="button"
                  onClick={() => d.saved && toggle(k)}
                  aria-expanded={expanded}
                  disabled={!d.saved}
                  style={st('flex:1 1 140px;min-width:0;display:flex;align-items:center;gap:8px;border:none;background:none;padding:0;color:var(--text);text-align:left')}
                >
                  {d.saved && <span aria-hidden="true" style={st('font:600 12px var(--font-ui);color:var(--muted);width:10px')}>{expanded ? '▾' : '▸'}</span>}
                  <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                    <span style={st('font:600 14.5px var(--font-ui)')}>{i === 0 ? t('settings.ai.first') : t('settings.ai.backup', { n: i })}</span>
                    {(!expanded || i !== 1) && d.saved && <span style={st('font:400 12px var(--font-ui);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{summary}</span>}
                    {i === 1 && expanded && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('settings.ai.backupHint')}</span>}
                  </span>
                  {bad && (
                    <span role="img" aria-label={t('settings.ai.entryFailed')} title={result && !result.ok ? result.message : undefined} style={st('font-size:16px;color:var(--danger)')}>
                      ⚠
                    </span>
                  )}
                  {good && (
                    <span role="img" aria-label={t('settings.ai.entryWorks')} title={t('settings.ai.entryWorks')} style={st('width:20px;height:20px;flex-shrink:0;border-radius:50%;background:var(--mint);color:#fff;display:inline-flex;align-items:center;justify-content:center;font:800 13px var(--font-ui)')}>
                      ✓
                    </span>
                  )}
                </button>
                <label style={st('display:flex;align-items:center;gap:6px;flex-shrink:0;font:500 12.5px var(--font-ui);color:var(--text2)')}>
                  <input type="checkbox" checked={!d.disabled} onChange={(e) => set(i, { disabled: !e.target.checked })} aria-label={t('settings.ai.enabledFor', { name: i === 0 ? t('settings.ai.first') : t('settings.ai.backup', { n: i }) })} style={st('width:18px;height:18px;accent-color:var(--acc)')} />
                  {t('settings.ai.enabled')}
                </label>
                {onTest && d.saved && (
                  <Btn kind="soft" height={32} padX={12} fontSize={12.5} disabled={testing !== null && testing !== undefined || benchRunning} onClick={() => { setBench((prev) => { const next = { ...prev }; delete next[i]; return next; }); onTest(i); }}>
                    {testing === i ? t('settings.ai.testing') : t('settings.ai.test')}
                  </Btn>
                )}
                {onBenchmark && d.saved && (
                  <Btn kind="soft" height={32} padX={12} fontSize={12.5} disabled={benchRunning || (testing !== null && testing !== undefined)} onClick={() => void runBenchmark(i)}>
                    {bench[i]?.running ? t('settings.ai.benchmarking') : t('settings.ai.benchmark')}
                  </Btn>
                )}
                {expanded && i > 1 && <Btn kind="ghost" height={32} padX={8} fontSize={12.5} aria-label={t('settings.ai.moveUp')} onClick={() => move(i, -1)}>↑</Btn>}
                {expanded && i > 0 && i < drafts.length - 1 && <Btn kind="ghost" height={32} padX={8} fontSize={12.5} aria-label={t('settings.ai.moveDown')} onClick={() => move(i, 1)}>↓</Btn>}
                {expanded && i > 0 && (
                  <Btn kind="ghost" height={32} padX={10} fontSize={12.5} style={{ color: 'var(--danger)' }} onClick={() => onChange(drafts.filter((_, j) => j !== i))}>
                    {t('settings.ai.removeEntry')}
                  </Btn>
                )}
              </div>
              {result && !result.ok && <span style={st('font:500 12.5px/1.4 var(--font-ui);color:var(--danger);overflow-wrap:anywhere')}>{result.message}</span>}
              {bench[i] && <BenchmarkPanel state={bench[i]} />}
              {expanded && lock.provider && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('pages.admin.ai.envLocked')}</span>}
              {expanded && <select
                value={d.provider}
                aria-label={t('settings.ai.provider')}
                disabled={lock.provider}
                onChange={(e) => set(i, { provider: e.target.value as AiProvider, apiKey: '', hasApiKey: false })}
                style={st(FIELD)}
              >
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {providerLabel(t, p)}
                  </option>
                ))}
              </select>}
              {expanded && (
                <div style={st('display:flex;gap:8px;align-items:center')}>
                  {modelLists[k]?.models && modelLists[k].models!.length > 0 ? (
                    <select value={d.model} disabled={lock.model} onChange={(e) => set(i, { model: e.target.value })} aria-label={t('settings.ai.model')} style={st(`${FIELD};flex:1`)}>
                      {/* A model that is set but not in the list (or nothing chosen yet) stays selectable. */}
                      {(!d.model || !modelLists[k].models!.includes(d.model)) && <option value={d.model}>{d.model || t('settings.ai.models.choose')}</option>}
                      {modelLists[k].models!.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={d.model} disabled={lock.model} onChange={(e) => set(i, { model: e.target.value })} placeholder={AI_RECOMMENDED_MODELS[d.provider] ?? t('settings.ai.modelPlaceholder')} aria-label={t('settings.ai.model')} maxLength={200} style={st(`${FIELD};flex:1`)} />
                  )}
                  {onListModels && !lock.model && d.saved && (
                    <Btn kind="soft" height={40} padX={12} fontSize={12.5} disabled={modelLists[k]?.loading} onClick={() => void loadModels(d, i, k)}>
                      {modelLists[k]?.loading ? t('settings.ai.models.loading') : modelLists[k]?.models ? t('settings.ai.models.refresh') : t('settings.ai.models.load')}
                    </Btn>
                  )}
                </div>
              )}
              {expanded && onListModels && !lock.model && !d.saved && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('settings.ai.models.saveFirst')}</span>}
              {expanded && modelLists[k]?.error && <span style={st('font:500 12.5px/1.4 var(--font-ui);color:var(--danger);overflow-wrap:anywhere')}>{modelLists[k].error}</span>}
              {expanded && AI_RECOMMENDED_MODELS[d.provider] && (
                <div style={st('display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:400 12px var(--font-ui);color:var(--muted)')}>
                  <span>{t('settings.ai.recommended', { model: AI_RECOMMENDED_MODELS[d.provider] ?? '' })}</span>
                  {!lock.model && d.model.trim() !== AI_RECOMMENDED_MODELS[d.provider] && (
                    <Btn kind="ghost" height={26} padX={10} fontSize={12} onClick={() => set(i, { model: AI_RECOMMENDED_MODELS[d.provider] ?? '' })}>
                      {t('settings.ai.useRecommended')}
                    </Btn>
                  )}
                </div>
              )}
              {expanded && showUrl && (
                <input value={d.baseUrl} disabled={lock.baseUrl} onChange={(e) => set(i, { baseUrl: e.target.value })} placeholder={t('settings.ai.baseUrlPlaceholder')} aria-label={t('settings.ai.baseUrl')} inputMode="url" style={st(FIELD)} />
              )}
              {expanded && (
                <input
                  type="password"
                  autoComplete="off"
                  value={d.apiKey}
                  disabled={lock.apiKey}
                  onChange={(e) => set(i, { apiKey: e.target.value })}
                  placeholder={d.hasApiKey ? t('settings.ai.apiKeySaved') : t('settings.ai.apiKeyNew')}
                  aria-label={t('settings.ai.apiKey')}
                  style={st(FIELD)}
                />
              )}
            </div>
          );
        })}
      </Group>
      {drafts.length - 1 < AI_MAX_FALLBACKS ? (
        <Btn kind="soft" height={40} padX={16} style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...drafts, emptyAiDraft(providers.find((p) => p !== 'ollama') ?? 'anthropic')])}>
          {t('settings.ai.addBackup')}
        </Btn>
      ) : (
        <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('settings.ai.maxBackups')}</span>
      )}
    </div>
  );
}

/** "The first provider failed and a backup answered" - shown wherever the settings are. */
export function AiFallbackWarning({ notice }: { notice: AiFallbackNotice | null | undefined }) {
  const t = useT();
  if (!notice) return null;
  return (
    <Banner>
      {t('settings.ai.fallbackWarning', {
        failed: providerLabel(t, notice.failedProvider),
        failedModel: notice.failedModel,
        used: providerLabel(t, notice.usedProvider),
        usedModel: notice.usedModel,
        error: notice.error,
      })}
    </Banner>
  );
}
