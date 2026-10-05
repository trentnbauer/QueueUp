import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiBacklogCoachResponse, AiCoachSuggestion } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { AiBadge, Banner, Btn, Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { SectionTitle } from './PageShell';

/** Backlog coach (issue #827): the AI reads the person's play history (as a few computed numbers)
 * and says what it sees, then suggests what to mark Won't play or play next. Every suggestion is an
 * action the person accepts or ignores; nothing changes on its own. Renders nothing without AI. */
export function BacklogCoach(): ReactNode {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const [result, setResult] = useState<AiBacklogCoachResponse | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: () => gamesApi.aiBacklogCoach(),
    onSuccess: (res) => {
      setError(null);
      setDone([]);
      setResult(res);
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('pages.coach.failed')),
  });
  const apply = useMutation({
    mutationFn: (s: AiCoachSuggestion) => gamesApi.updateStatus(s.gameId, { status: s.action }),
    onSuccess: (_res, s) => {
      setDone((d) => [...d, s.gameId]);
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'backlog-insights'] });
      ui.notify(t(s.action === 'wont_play' ? 'pages.coach.markedWontPlay' : 'pages.coach.markedPlayNext', { title: s.title }));
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('pages.coach.failed')),
  });

  if (!ai.data || ai.data.effectiveSource === 'none') return null;
  const suggestions = (result?.suggestions ?? []).filter((s) => !done.includes(s.gameId));

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <div style={st('display:flex;align-items:center;gap:8px')}>
        <SectionTitle>{t('pages.coach.title')}</SectionTitle>
        {result?.enoughData && <AiBadge title={t('pages.coach.badge')} />}
      </div>
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('pages.coach.intro')}</span>
      <div>
        <Btn height={38} padX={16} disabled={ask.isPending} onClick={() => ask.mutate()}>
          {ask.isPending ? t('pages.coach.thinking') : result ? t('pages.coach.again') : t('pages.coach.ask')}
        </Btn>
      </div>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {result && !result.enoughData && <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{t('pages.coach.notEnough')}</span>}
      {result?.enoughData && result.patterns.length > 0 && (
        <ul style={st('margin:0;padding:0 0 0 18px;display:flex;flex-direction:column;gap:6px;font:400 14px/1.45 var(--font-ui);color:var(--text2)')}>
          {result.patterns.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {result?.enoughData && suggestions.map((s) => (
        <div key={s.gameId} style={st('display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:var(--surf)')}>
          <div style={st('display:flex;align-items:center;gap:12px;min-width:0')}>
            <Cover title={s.title} url={s.coverImageUrl} width={40} radius={8} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{s.title}</span>
              <span style={st('font:600 12px var(--font-mono);letter-spacing:0.04em;color:var(--accText)')}>{t(s.action === 'wont_play' ? 'pages.coach.suggestWontPlay' : 'pages.coach.suggestPlayNext')}</span>
            </span>
          </div>
          {s.reason && <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--text2)')}>{s.reason}</span>}
          <div style={st('display:flex;gap:8px')}>
            <Btn kind="soft" height={34} padX={14} fontSize={13} disabled={apply.isPending} onClick={() => apply.mutate(s)}>
              {t(s.action === 'wont_play' ? 'pages.coach.acceptWontPlay' : 'pages.coach.acceptPlayNext')}
            </Btn>
            <Btn kind="ghost" height={34} padX={12} fontSize={13} disabled={apply.isPending} onClick={() => setDone((d) => [...d, s.gameId])}>
              {t('pages.coach.ignore')}
            </Btn>
          </div>
        </div>
      ))}
    </div>
  );
}
