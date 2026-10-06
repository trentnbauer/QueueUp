import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminAiResponse, AiFallbackInput } from '@queueup/shared';
import { ADMIN_AI_QUERY_KEY, aiApi } from '../api/ai';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { AiFallbackWarning, AiProvidersEditor, draftFromEntry, emptyAiDraft, listAfterSave, listSwapped, listWithout, reconcileDrafts, type AiDraft, type AiEntryTest, type SavedEntry } from '../dialogs/AiProvidersEditor';
import { Banner, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

/** Administrator settings: the server-wide AI provider and its backups. Parts a Docker env var sets
 * show as locked; the rest are saved here. */
export function AdminAiSection() {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ADMIN_AI_QUERY_KEY, queryFn: aiApi.admin });
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState<AiDraft[] | null>(null);
  // What the server has saved, kept up to date from each save's own answer (a refetch can lag behind).
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [savingEntry, setSavingEntry] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savedOf = (d: AdminAiResponse): SavedEntry[] => [
    ...(d.provider ? [{ provider: d.provider, model: d.model, baseUrl: d.baseUrl, hasApiKey: d.sources.AI_API_KEY !== 'unset', disabled: d.disabled }] : []),
    ...d.fallbacks,
  ];
  const draftsOf = (d: AdminAiResponse): AiDraft[] => {
    const entries = savedOf(d);
    return d.provider ? entries.map(draftFromEntry) : [emptyAiDraft(), ...entries.map(draftFromEntry)];
  };
  useEffect(() => {
    if (!data || drafts) return;
    setSaved(savedOf(data));
    setDrafts(draftsOf(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, drafts]);

  // Per-entry tests: each saved provider can be tried on its own, and keeps its last result.
  const [entryResults, setEntryResults] = useState<Record<number, AiEntryTest>>({});
  const [testingEntry, setTestingEntry] = useState<number | null>(null);
  async function testEntry(i: number) {
    setTestingEntry(i);
    try {
      const r = await aiApi.testAdmin(i);
      setEntryResults((prev) => ({ ...prev, [i]: { ok: true } }));
      ui.notify(t('settings.ai.testOk', { provider: t(`settings.ai.providerName.${r.provider}` as MessageKey), model: r.model }));
    } catch (e) {
      setEntryResults((prev) => ({ ...prev, [i]: { ok: false, message: e instanceof Error ? e.message : t('settings.ai.testFailed') } }));
    } finally {
      setTestingEntry(null);
    }
  }

  /** Saves a whole list (first provider, then backups) and returns it as the server now has it. */
  async function persist(list: AiFallbackInput[]): Promise<AiDraft[]> {
    const [first, ...rest] = list;
    const { id: _id, ...primary } = first;
    const next = await aiApi.saveAdmin({ ...primary, fallbacks: rest });
    setSaved(savedOf(next));
    queryClient.setQueryData(ADMIN_AI_QUERY_KEY, next);
    return draftsOf(next);
  }

  /** Saves just this entry; the others stay as they are saved (their unsaved edits are kept on screen). */
  async function saveEntry(i: number) {
    if (!drafts) return;
    setSavingEntry(i);
    setError(null);
    try {
      const server = await persist(listAfterSave(saved, drafts, i));
      setDrafts(reconcileDrafts(drafts, server, i));
      setEntryResults((prev) => {
        const next = { ...prev };
        delete next[i];
        return next;
      });
      ui.notify(t('pages.admin.ai.saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.ai.error'));
    } finally {
      setSavingEntry(null);
    }
  }

  async function removeEntry(i: number) {
    if (!drafts) return;
    if (!drafts[i].saved) return setDrafts(drafts.filter((_, j) => j !== i));
    const ok = await confirm({ title: t('settings.ai.removeEntryTitle'), message: t('settings.ai.removeEntryMessage'), confirmLabel: t('common.remove'), danger: true });
    if (!ok) return;
    setSavingEntry(i);
    try {
      setDrafts(reconcileDrafts(drafts, await persist(listWithout(saved, i))));
      setEntryResults({});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.ai.error'));
    } finally {
      setSavingEntry(null);
    }
  }

  async function moveEntry(i: number, by: -1 | 1) {
    if (!drafts) return;
    if (i >= saved.length || i + by >= saved.length) {
      const next = [...drafts];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return setDrafts(next);
    }
    setSavingEntry(i);
    try {
      setDrafts(reconcileDrafts(drafts, await persist(listSwapped(saved, i, by))));
      setEntryResults({});
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.ai.error'));
    } finally {
      setSavingEntry(null);
    }
  }

  if (!data || !drafts) return null;
  const envSet = (k: keyof typeof data.sources) => data.sources[k] === 'env';

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <Kicker>{t('pages.admin.ai.kicker')}</Kicker>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>{t('pages.admin.ai.hint')}</span>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      <AiFallbackWarning notice={data.lastFallback} />
      <AiProvidersEditor
        drafts={drafts}
        onChange={setDrafts}
        providers={data.providers}
        allowBaseUrl
        onTest={(i) => void testEntry(i)}
        testing={testingEntry}
        results={entryResults}
        onBenchmark={aiApi.benchmarkAdmin}
        onListModels={aiApi.modelsAdmin}
        onSaveEntry={(i) => void saveEntry(i)}
        savingEntry={savingEntry}
        onMoveEntry={(i, by) => void moveEntry(i, by)}
        onRemoveEntry={(i) => void removeEntry(i)}
        locked={{ provider: envSet('AI_PROVIDER'), model: envSet('AI_MODEL'), baseUrl: envSet('AI_BASE_URL'), apiKey: envSet('AI_API_KEY') }}
      />
      {!data.provider && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('pages.admin.ai.notSet')}</span>}
    </div>
  );
}
