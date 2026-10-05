import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ADMIN_AI_QUERY_KEY, aiApi } from '../api/ai';
import { useUi } from '../context/UiContext';
import { AiFallbackWarning, AiProvidersEditor, draftFromEntry, draftToInput, emptyAiDraft, type AiDraft } from '../dialogs/AiProvidersEditor';
import { Banner, Btn, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

/** Administrator settings: the server-wide AI provider and its backups. Parts a Docker env var sets
 * show as locked; the rest are saved here. */
export function AdminAiSection() {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ADMIN_AI_QUERY_KEY, queryFn: aiApi.admin });
  const [drafts, setDrafts] = useState<AiDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (d: NonNullable<typeof data>) =>
    setDrafts([
      d.provider ? { ...draftFromEntry({ provider: d.provider, model: d.model, baseUrl: d.baseUrl, hasApiKey: d.sources.AI_API_KEY !== 'unset' }) } : emptyAiDraft(),
      ...d.fallbacks.map(draftFromEntry),
    ]);
  useEffect(() => {
    if (data && !drafts) load(data);
  }, [data, drafts]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_AI_QUERY_KEY });
  const save = useMutation({
    mutationFn: () => {
      const [first, ...rest] = drafts!;
      const { id: _id, ...primary } = draftToInput(first);
      return aiApi.saveAdmin({ ...primary, fallbacks: rest.map(draftToInput) });
    },
    onSuccess: (next) => {
      setError(null);
      load(next);
      queryClient.setQueryData(ADMIN_AI_QUERY_KEY, next);
      ui.notify(t('pages.admin.ai.saved'));
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('settings.ai.error')),
  });
  const test = useMutation({
    mutationFn: aiApi.testAdmin,
    onSuccess: (r) => {
      setError(null);
      ui.notify(t('settings.ai.testOk', { provider: t(`settings.ai.providerName.${r.provider}` as MessageKey), model: r.model }));
      void refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('settings.ai.testFailed')),
  });

  if (!data || !drafts) return null;
  const envSet = (k: keyof typeof data.sources) => data.sources[k] === 'env';
  const busy = save.isPending || test.isPending;

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
        locked={{ provider: envSet('AI_PROVIDER'), model: envSet('AI_MODEL'), baseUrl: envSet('AI_BASE_URL'), apiKey: envSet('AI_API_KEY') }}
      />
      <div style={st('display:flex;flex-wrap:wrap;gap:8px;align-items:center')}>
        <Btn height={40} padX={18} disabled={busy} onClick={() => save.mutate()}>
          {t('settings.ai.save')}
        </Btn>
        {data.provider && (
          <Btn kind="soft" height={40} padX={16} disabled={busy} onClick={() => test.mutate()}>
            {test.isPending ? t('settings.ai.testing') : t('settings.ai.test')}
          </Btn>
        )}
        {!data.provider && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('pages.admin.ai.notSet')}</span>}
      </div>
    </div>
  );
}
