import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiRecommendation } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { gamesApi } from '../api/games';
import { roomsApi } from '../api/rooms';
import { useT } from '../i18n';

/** AI game picks for Add Game (issues #820, #821): the person taps "Ask AI" and gets a few games to
 * add, each with a reason. For the Personal Shelf when `roomId` is null, else for that room.
 * `ready` is false when no AI is available, so the button is not shown. In a room the room's
 * sponsor counts, since the server falls back to their key. */
export function useAiPicks(roomId: string | null) {
  const t = useT();
  const queryClient = useQueryClient();
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const roomAi = useQuery({ queryKey: ['room-ai', roomId], queryFn: () => roomsApi.ai(roomId!), enabled: roomId !== null });
  const [picks, setPicks] = useState<AiRecommendation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await gamesApi.aiRecommend(roomId);
      setPicks(res.recommendations);
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('add.game.ai.failed'));
    } finally {
      setBusy(false);
    }
  }

  const ready = (!!ai.data && ai.data.effectiveSource !== 'none') || (roomId !== null && !!roomAi.data?.sponsor);
  return { ready, picks, busy, error, ask };
}
