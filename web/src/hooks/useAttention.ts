import { useQuery } from '@tanstack/react-query';
import type { AttentionSummary } from '@queueup/shared';
import { apiGet } from '../api/client';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL_MS = 30_000;
export const ATTENTION_QUERY_KEY = ['attention'] as const;

/** Per-room "this still needs you" counts (games you haven't voted on, suggestions awaiting
 * approval) - what puts the red dot on a room tile until you've dealt with it. */
export function useAttention() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ATTENTION_QUERY_KEY,
    queryFn: () => apiGet<AttentionSummary>('/api/me/attention'),
    enabled: !!user,
    refetchInterval: POLL_INTERVAL_MS,
  });
  const byRoom = new Map((query.data?.rooms ?? []).map((r) => [r.roomId, r]));
  return {
    toVote: (roomId: string) => byRoom.get(roomId)?.toVote ?? 0,
    toApprove: (roomId: string) => byRoom.get(roomId)?.toApprove ?? 0,
    needsYou: (roomId: string) => {
      const r = byRoom.get(roomId);
      return !!r && (r.toVote > 0 || r.toApprove > 0);
    },
  };
}
