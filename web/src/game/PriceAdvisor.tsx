import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiPriceAdvice, Game } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { gamesApi } from '../api/games';
import { fmtMoney } from '../lib/gameView';
import { AiBadge, Btn, Spinner } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

/** "Buy or wait?" (issue #829): explains the price history in plain words and suggests a target price
 * for the price alert, which can be accepted with one tap. The numbers come from QueueUp's price
 * data; the AI only explains them. Renders nothing when AI is not set up. */
export function PriceAdvisor({ game, onSetTarget }: { game: Game; onSetTarget: (price: number) => void }): ReactNode {
  const t = useT();
  const queryClient = useQueryClient();
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const [advice, setAdvice] = useState<AiPriceAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: () => gamesApi.aiPriceAdvice(game.id),
    onSuccess: (res) => {
      setError(null);
      setAdvice(res.advice);
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('game.detail.advisor.failed')),
  });

  if (!ai.data || ai.data.effectiveSource === 'none') return null;
  const currency = advice?.currency ?? game.price.currency;

  return (
    <div style={st('display:flex;flex-direction:column;gap:8px')}>
      <Btn kind="soft" height={36} padX={14} fontSize={13} disabled={ask.isPending} onClick={() => ask.mutate()} style={{ alignSelf: 'flex-start' }}>
        {ask.isPending ? <span style={st('display:inline-flex;align-items:center;gap:8px')}><Spinner />{t('game.detail.advisor.thinking')}</span> : advice ? t('game.detail.advisor.again') : t('game.detail.advisor.ask')}
      </Btn>
      {error && <span style={st('font:500 13px var(--font-ui);color:var(--danger)')}>{error}</span>}
      {advice && !advice.enoughHistory && <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('game.detail.advisor.notEnough')}</span>}
      {advice?.enoughHistory && (
        <div style={st('display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:var(--surf)')}>
          <div style={st('display:flex;align-items:center;gap:8px')}>
            <AiBadge title={t('game.detail.advisor.badge')} />
            {advice.verdict && <span style={st('font:700 14px var(--font-ui)')}>{t(`game.detail.advisor.verdict.${advice.verdict}` as MessageKey)}</span>}
          </div>
          {advice.summary && <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{advice.summary}</span>}
          <span style={st('font:400 12px var(--font-mono);color:var(--muted)')}>
            {[
              t('game.detail.advisor.now', { price: fmtMoney(advice.current, currency) }),
              advice.usual !== null ? t('game.detail.advisor.usual', { price: fmtMoney(advice.usual, currency) }) : '',
              advice.lowestRecorded !== null ? t('game.detail.advisor.lowest', { price: fmtMoney(advice.lowestRecorded, currency) }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {advice.suggestedTarget !== null && (
            <div>
              <Btn height={34} padX={14} fontSize={13} onClick={() => onSetTarget(advice.suggestedTarget!)}>
                {t('game.detail.advisor.setAlert', { price: fmtMoney(advice.suggestedTarget, currency) })}
              </Btn>
            </div>
          )}
          <span style={st('font:400 11.5px/1.4 var(--font-ui);color:var(--muted)')}>{t('game.detail.advisor.disclaimer')}</span>
        </div>
      )}
    </div>
  );
}
