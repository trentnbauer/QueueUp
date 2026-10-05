import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiSearchFilters, GameSearchResult } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { gamesApi } from '../api/games';
import { roomsApi } from '../api/rooms';
import { useT } from '../i18n';

export interface AiSearchState {
  filters: AiSearchFilters;
  unsupported: string[];
  results: GameSearchResult[];
}

/** Plain-language search for Add Game (issue #823). `search` turns a sentence into filters and runs
 * them; `edit` re-runs changed filters (a chip removed) without asking the AI again; `clear` goes back to the
 * ordinary search. `ready` is false when no AI is available (in a room, the sponsor counts). */
export function useAiSearch(roomId: string | null, allPlatforms: boolean) {
  const t = useT();
  const queryClient = useQueryClient();
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const roomAi = useQuery({ queryKey: ['room-ai', roomId], queryFn: () => roomsApi.ai(roomId!), enabled: roomId !== null });
  const [state, setState] = useState<AiSearchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(text: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await gamesApi.aiSearch({ text, roomId, allPlatforms });
      setState({ filters: res.filters, unsupported: res.unsupported, results: res.results });
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('add.game.aiSearch.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function edit(filters: AiSearchFilters) {
    setBusy(true);
    setError(null);
    try {
      const res = await gamesApi.aiSearchRun({ filters, roomId, allPlatforms });
      setState((s) => ({ filters, unsupported: s?.unsupported ?? [], results: res.results }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('add.game.aiSearch.failed'));
    } finally {
      setBusy(false);
    }
  }

  const ready = (!!ai.data && ai.data.effectiveSource !== 'none') || (roomId !== null && !!roomAi.data?.sponsor);
  return { ready, state, busy, error, search, edit, clear: () => { setState(null); setError(null); } };
}
