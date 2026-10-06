import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiFallbackInput } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Banner, Btn } from '../ui/primitives';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';
import { AiFallbackWarning, AiProvidersEditor, draftFromEntry, emptyAiDraft, listAfterSave, listSwapped, listWithout, reconcileDrafts, type AiDraft, type AiEntryTest, type SavedEntry } from './AiProvidersEditor';

/** Personal AI settings: a first provider and key, plus backups tried in order when it fails. The
 * same content is reused as a step in onboarding via `AiSettingsForm`. */
export function AiSettingsForm({ onSaved }: { onSaved?: () => void }) {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const [drafts, setDrafts] = useState<AiDraft[] | null>(null);
  // What the server has saved, kept up to date from each save's own answer (a refetch can lag behind).
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [savingEntry, setSavingEntry] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start from what's saved, once. Later refetches (after a save) must not wipe what's being typed.
  useEffect(() => {
    if (!data || drafts) return;
    setSaved(data.user ? [data.user, ...data.user.fallbacks] : []);
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

  /** Saves a whole list (first provider, then backups) and returns it as the server now has it. */
  async function persist(list: AiFallbackInput[]): Promise<AiDraft[]> {
    const [first, ...rest] = list;
    const { id: _id, ...primary } = first;
    const { user } = await aiApi.save({ ...primary, fallbacks: rest });
    setSaved([user, ...user.fallbacks]);
    void refresh();
    return [draftFromEntry(user), ...user.fallbacks.map(draftFromEntry)];
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
      ui.notify(t('settings.ai.saved'));
      onSaved?.();
    } catch (e) {
      fail(e, t('settings.ai.error'));
    } finally {
      setSavingEntry(null);
    }
  }

  /** Removes an entry: a saved one is deleted straight away (after asking), a new one just goes. */
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
      fail(e, t('settings.ai.error'));
    } finally {
      setSavingEntry(null);
    }
  }

  /** Moves an entry up or down: two saved entries swap places straight away, otherwise it just moves on screen. */
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
      fail(e, t('settings.ai.error'));
    } finally {
      setSavingEntry(null);
    }
  }
  const clear = useMutation({
    mutationFn: aiApi.clear,
    onSuccess: () => {
      setDrafts([emptyAiDraft()]);
      setSaved([]);
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

  const busy = clear.isPending || testingEntry !== null || savingEntry !== null;

  return (
    <div style={st('display:flex;flex-direction:column;gap:14px')}>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.ai.intro')}</span>
      <span style={st('font:500 13px/1.45 var(--font-ui);color:var(--text2)')}>{t(`settings.ai.source.${data.effectiveSource}` as MessageKey)}</span>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      <AiFallbackWarning notice={data.lastFallback} />
      <AiProvidersEditor drafts={drafts} onChange={setDrafts} providers={data.providers} allowBaseUrl={data.userBaseUrlAllowed} onTest={(i) => void testEntry(i)} testing={testingEntry} results={entryResults} onBenchmark={aiApi.benchmark} onListModels={aiApi.models} onSaveEntry={(i) => void saveEntry(i)} savingEntry={savingEntry} onMoveEntry={(i, by) => void moveEntry(i, by)} onRemoveEntry={(i) => void removeEntry(i)} />
      {data.server && (
        <div style={st('display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:16px;background:var(--surf)')}>
          <span style={st('font:600 14.5px var(--font-ui)')}>{t('settings.ai.serverEntry')}</span>
          <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('settings.ai.serverEntryHint')}</span>
        </div>
      )}
      {data.user && (
        <div style={st('display:flex;flex-wrap:wrap;gap:8px;align-items:center')}>
          <Btn kind="ghost" height={40} padX={12} style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => void confirmClear()}>
            {t('settings.ai.clear')}
          </Btn>
        </div>
      )}
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
