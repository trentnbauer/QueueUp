import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiTonightPick, AiTonightResponse } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { AiPickedBadge, Banner, Btn, Cover, Spinner, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

const GAMES_QUERY_ROOT = ['games'];
const QUICK = ['chill', 'short', 'story', 'challenge'] as const;

function PickCard({ pick, label, onStart, busy }: { pick: AiTonightPick; label: string; onStart: () => void; busy: boolean }) {
  const t = useT();
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:18px;background:var(--surf)')}>
      <div style={st('display:flex;align-items:center;gap:8px')}>
        <AiPickedBadge title={t('home.tonight.badge')} />
        <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{label}</span>
      </div>
      <div style={st('display:flex;gap:12px;align-items:center;min-width:0')}>
        <Cover title={pick.title} url={pick.coverImageUrl} width={56} radius={10} />
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
          <span style={st('font:700 17px var(--font-ui)')}>{pick.title}</span>
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
            {[pick.platform, pick.timeToBeatHours ? t('home.tonight.hours', { n: Math.round(pick.timeToBeatHours) }) : ''].filter(Boolean).join(' · ')}
          </span>
        </span>
      </div>
      {pick.reason && <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{pick.reason}</span>}
      <div>
        <Btn height={38} padX={16} disabled={busy} onClick={onStart}>
          {t('home.tonight.start')}
        </Btn>
      </div>
    </div>
  );
}

/** "What should I play tonight?" (issue #825): the person says what they are after and the AI picks
 * from their own backlog, with a reason and an alternate. Sits alongside Spin the Wheel. */
export function AiTonightDialog() {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const aiReady = !!ai.data && ai.data.effectiveSource !== 'none';
  const [wish, setWish] = useState('');
  const [result, setResult] = useState<AiTonightResponse | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: (excludeIds: string[]) => gamesApi.aiTonight({ request: wish, excludeIds }),
    onSuccess: (res) => {
      setError(null);
      setResult(res);
      setSeen((s) => [...new Set([...s, res.pick.gameId, ...(res.alternate ? [res.alternate.gameId] : [])])]);
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('home.tonight.failed')),
  });
  const start = useMutation({
    mutationFn: (pick: AiTonightPick) => gamesApi.updateStatus(pick.gameId, { status: 'playing' }),
    onSuccess: (_res, pick) => {
      void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
      ui.notify(t('home.tonight.started', { title: pick.title }));
      ui.closeDialog('aiTonight');
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('home.tonight.failed')),
  });

  const busy = ask.isPending || start.isPending;

  return (
    <Dialog onClose={() => ui.closeDialog('aiTonight')} title={t('home.tonight.title')} gap={14}>
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('home.tonight.intro')}</span>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {ai.data && !aiReady ? (
        <span style={st('font:500 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{t('home.tonight.needsAi')}</span>
      ) : (
        <>
          <input
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            maxLength={300}
            placeholder={t('home.tonight.placeholder')}
            aria-label={t('home.tonight.placeholder')}
            style={st(inputPill, { height: 48, flexShrink: 0 })}
          />
          <div style={st('display:flex;flex-wrap:wrap;gap:8px')}>
            {QUICK.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setWish(t(`home.tonight.quick.${k}` as MessageKey))}
                style={st('height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text2);font:500 12.5px var(--font-ui)')}
              >
                {t(`home.tonight.quick.${k}` as MessageKey)}
              </button>
            ))}
          </div>
          <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
            <Btn height={40} padX={18} disabled={busy || !wish.trim() || !aiReady} onClick={() => ask.mutate([])}>
              {ask.isPending ? <span style={st('display:inline-flex;align-items:center;gap:8px')}><Spinner />{t('home.tonight.thinking')}</span> : result ? t('home.tonight.pickAgain') : t('home.tonight.pick')}
            </Btn>
          </div>
        </>
      )}
      {result && (
        <>
          <PickCard pick={result.pick} label={t('home.tonight.tonightPick')} busy={busy} onStart={() => start.mutate(result.pick)} />
          {result.alternate && <PickCard pick={result.alternate} label={t('home.tonight.alternate')} busy={busy} onStart={() => start.mutate(result.alternate!)} />}
          <div>
            <Btn kind="ghost" height={34} padX={12} fontSize={12.5} disabled={busy} onClick={() => ask.mutate(seen)}>
              {t('home.tonight.another')}
            </Btn>
          </div>
        </>
      )}
    </Dialog>
  );
}
