import { AI_MAX_FALLBACKS, AI_RECOMMENDED_MODELS, type AiFallbackEntry, type AiFallbackInput, type AiFallbackNotice, type AiProvider } from '@queueup/shared';
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
}

export const emptyAiDraft = (provider: AiProvider = 'anthropic'): AiDraft => ({ provider, model: '', baseUrl: '', apiKey: '', hasApiKey: false });

export const draftFromEntry = (e: { id?: string; provider: AiProvider; model: string | null; baseUrl: string | null; hasApiKey: boolean }): AiDraft => ({
  id: e.id,
  provider: e.provider,
  model: e.model ?? '',
  baseUrl: e.baseUrl ?? '',
  apiKey: '',
  hasApiKey: e.hasApiKey,
});

export const draftToInput = (d: AiDraft): AiFallbackInput => ({
  id: d.id,
  provider: d.provider,
  model: d.model.trim() || null,
  baseUrl: d.baseUrl.trim() || null,
  apiKey: d.apiKey.trim() || undefined,
});

export const fallbacksFromEntries = (list: AiFallbackEntry[]): AiDraft[] => list.map(draftFromEntry);

const FIELD = 'height:40px;padding:0 12px;border-radius:12px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-size:14px;outline:none;min-width:0;width:100%;box-sizing:border-box';

/** A provider's name in the picker. */
const providerLabel = (t: ReturnType<typeof useT>, p: AiProvider) => t(`settings.ai.providerName.${p}` as MessageKey);

/** The first provider and its backups, in the order they're tried. Used by both the personal
 * settings dialog and Administrator settings. `locked` pins parts of the first entry that a Docker
 * env var sets, so they show but can't be edited here. */
export function AiProvidersEditor({
  drafts,
  onChange,
  providers,
  allowBaseUrl,
  locked,
}: {
  drafts: AiDraft[];
  onChange: (next: AiDraft[]) => void;
  providers: AiProvider[];
  allowBaseUrl: boolean;
  locked?: { provider?: boolean; model?: boolean; baseUrl?: boolean; apiKey?: boolean };
}) {
  const t = useT();
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
          return (
            <div key={d.id ?? `new-${i}`} style={st('display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:var(--surf)')}>
              <div style={st('display:flex;align-items:center;gap:6px')}>
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                  <span style={st('font:600 14.5px var(--font-ui)')}>{i === 0 ? t('settings.ai.first') : t('settings.ai.backup', { n: i })}</span>
                  {i === 1 && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('settings.ai.backupHint')}</span>}
                </span>
                {i > 1 && <Btn kind="ghost" height={32} padX={8} fontSize={12.5} aria-label={t('settings.ai.moveUp')} onClick={() => move(i, -1)}>↑</Btn>}
                {i > 0 && i < drafts.length - 1 && <Btn kind="ghost" height={32} padX={8} fontSize={12.5} aria-label={t('settings.ai.moveDown')} onClick={() => move(i, 1)}>↓</Btn>}
                {i > 0 && (
                  <Btn kind="ghost" height={32} padX={10} fontSize={12.5} style={{ color: 'var(--danger)' }} onClick={() => onChange(drafts.filter((_, j) => j !== i))}>
                    {t('settings.ai.removeEntry')}
                  </Btn>
                )}
              </div>
              {lock.provider && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('pages.admin.ai.envLocked')}</span>}
              <select
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
              </select>
              <input value={d.model} disabled={lock.model} onChange={(e) => set(i, { model: e.target.value })} placeholder={AI_RECOMMENDED_MODELS[d.provider] ?? t('settings.ai.modelPlaceholder')} aria-label={t('settings.ai.model')} maxLength={200} style={st(FIELD)} />
              {AI_RECOMMENDED_MODELS[d.provider] && (
                <div style={st('display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:400 12px var(--font-ui);color:var(--muted)')}>
                  <span>{t('settings.ai.recommended', { model: AI_RECOMMENDED_MODELS[d.provider] ?? '' })}</span>
                  {!lock.model && d.model.trim() !== AI_RECOMMENDED_MODELS[d.provider] && (
                    <Btn kind="ghost" height={26} padX={10} fontSize={12} onClick={() => set(i, { model: AI_RECOMMENDED_MODELS[d.provider] ?? '' })}>
                      {t('settings.ai.useRecommended')}
                    </Btn>
                  )}
                </div>
              )}
              {showUrl && (
                <input value={d.baseUrl} disabled={lock.baseUrl} onChange={(e) => set(i, { baseUrl: e.target.value })} placeholder={t('settings.ai.baseUrlPlaceholder')} aria-label={t('settings.ai.baseUrl')} inputMode="url" style={st(FIELD)} />
              )}
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
