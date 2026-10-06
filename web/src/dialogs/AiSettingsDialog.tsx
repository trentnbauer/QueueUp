import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Banner, Btn } from '../ui/primitives';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';
import { AiFallbackWarning, AiProvidersEditor, draftFromEntry, draftToInput, emptyAiDraft, type AiDraft, type AiEntryTest } from './AiProvidersEditor';

/** Personal AI settings: a first provider and key, plus backups tried in order when it fails. The
 * same content is reused as a step in onboarding via `AiSettingsForm`. */
export function AiSettingsForm({ onSaved }: { onSaved?: () => void }) {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const [drafts, setDrafts] = useState<AiDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start from what's saved, once. Later refetches (after a save) must not wipe what's being typed.
  useEffect(() => {
    if (!data || drafts) return;
    setDrafts(data.user ? [draftFromEntry(data.user), ...data.user.fallbacks.map(draftFromEntry)] : [emptyAiDraft()]);
  }, [data, drafts]);

  // Per-entry tests: each saved provider can be tried on its own, and keeps its last result.
  const [entryResults, setEntryResults] = useState<Record<number, AiEntryTest>>({});
  const [testingEntry, setTestingEntry] = useState<number | null>(null);
  async function testEntry(i: number) {
    setTestingEntry(i);
    try {
      const r = await aiApi.test(i);
      setEntryResults((prev) => ({ ...prev, [i]: { ok: true } }));
      ui.notify(t('settings.ai.testOk', { provider: t(`settings.ai.providerName.${r.provider}` as MessageKey), model: r.model }));
    } catch (e) {
      setEntryResults((prev) => ({ ...prev, [i]: { ok: false, message: e instanceof Error ? e.message : t('settings.ai.testFailed') } }));
    } finally {
      setTestingEntry(null);
    }
  }

  const fail = (e: unknown, fallback: string) => setError(e instanceof Error ? e.message : fallback);
  const refresh = () => queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });

  const save = useMutation({
    mutationFn: () => {
      const [first, ...rest] = drafts!;
      const { id: _id, ...primary } = draftToInput(first);
      return aiApi.save({ ...primary, fallbacks: rest.map(draftToInput) });
    },
    onSuccess: ({ user }) => {
      setError(null);
      setDrafts([draftFromEntry(user), ...user.fallbacks.map(draftFromEntry)]);
      setEntryResults({});
      ui.notify(t('settings.ai.saved'));
      void refresh();
      onSaved?.();
    },
    onError: (e) => fail(e, t('settings.ai.error')),
  });
  const test = useMutation({
    mutationFn: () => aiApi.test(),
    onSuccess: (r) => {
      setError(null);
      ui.notify(t('settings.ai.testOk', { provider: t(`settings.ai.providerName.${r.provider}` as MessageKey), model: r.model }));
      void refresh();
    },
    onError: (e) => fail(e, t('settings.ai.testFailed')),
  });
  const clear = useMutation({
    mutationFn: aiApi.clear,
    onSuccess: () => {
      setDrafts([emptyAiDraft()]);
      ui.notify(t('settings.ai.cleared'));
      void refresh();
    },
    onError: (e) => fail(e, t('settings.ai.error')),
  });

  async function confirmClear() {
    const ok = await confirm({ title: t('settings.ai.clearTitle'), message: t('settings.ai.clearMessage'), confirmLabel: t('common.remove'), danger: true });
    if (ok) clear.mutate();
  }

  if (!data || !drafts) return null;
  if (!data.userSettingsAllowed) return <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('settings.ai.notAllowed')}</span>;

  const busy = save.isPending || test.isPending || clear.isPending || testingEntry !== null;

  return (
    <div style={st('display:flex;flex-direction:column;gap:14px')}>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.ai.intro')}</span>
      <span style={st('font:500 13px/1.45 var(--font-ui);color:var(--text2)')}>{t(`settings.ai.source.${data.effectiveSource}` as MessageKey)}</span>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      <AiFallbackWarning notice={data.lastFallback} />
      <AiProvidersEditor drafts={drafts} onChange={setDrafts} providers={data.providers} allowBaseUrl={data.userBaseUrlAllowed} onTest={(i) => void testEntry(i)} testing={testingEntry} results={entryResults} onBenchmark={aiApi.benchmark} />
      {data.server && (
        <div style={st('display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:16px;background:var(--surf)')}>
          <span style={st('font:600 14.5px var(--font-ui)')}>{t('settings.ai.serverEntry')}</span>
          <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('settings.ai.serverEntryHint')}</span>
        </div>
      )}
      <div style={st('display:flex;flex-wrap:wrap;gap:8px;align-items:center')}>
        <Btn height={40} padX={18} disabled={busy} onClick={() => save.mutate()}>
          {t('settings.ai.save')}
        </Btn>
        {data.user && (
          <Btn kind="soft" height={40} padX={16} disabled={busy} onClick={() => test.mutate()}>
            {test.isPending ? t('settings.ai.testing') : t('settings.ai.test')}
          </Btn>
        )}
        {data.user && (
          <Btn kind="ghost" height={40} padX={12} style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => void confirmClear()}>
            {t('settings.ai.clear')}
          </Btn>
        )}
      </div>
    </div>
  );
}

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Dialog onClose={onClose} title={t('settings.ai.title')} gap={14}>
      <AiSettingsForm />
    </Dialog>
  );
}
