import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiRecommendation } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { gamesApi } from '../api/games';
import { useT } from '../i18n';

/** AI game picks for Add Game (issue #820): the person taps "Ask AI" and gets a few games to add,
 * each with a reason. `ready` is false when AI is not set up, so the button is not shown. */
export function useAiPicks(enabled: boolean) {
  const t = useT();
  const queryClient = useQueryClient();
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine, enabled });
  const [picks, setPicks] = useState<AiRecommendation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await gamesApi.aiRecommend();
      setPicks(res.recommendations);
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('add.game.ai.failed'));
    } finally {
      setBusy(false);
    }
  }

  return { ready: enabled && !!ai.data && ai.data.effectiveSource !== 'none', picks, busy, error, ask };
}
