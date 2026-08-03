import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { useAnnounceUnlock } from '../context/AchievementUnlockContext';

/** Fetches this game's per-player Steam achievement progress on demand, when the detail modal
 * mounts - not baked into the shelf/room list load, since it's a live Steam API call per player.
 * The server itself resolves to an empty list for a game with no Steam release or no players with
 * a usable Steam account, so there's no client-side gating needed beyond "the modal is open" (see
 * GameCard.tsx, which only mounts GameDetailModal - and so this hook - while detailOpen is true).
 * Failures resolve to an empty list too rather than surfacing an error - achievement progress is a
 * nice-to-have, not something worth blocking or erroring the rest of the modal over. */
export function useGameAchievements(gameId: string) {
  const announceUnlock = useAnnounceUnlock();
  const query = useQuery({
    queryKey: ['games', gameId, 'achievements'],
    queryFn: () => gamesApi.achievements(gameId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Issue #489 - this is one of the few places the app actually observes a 100% completion,
  // opening the detail modal is a perfectly good moment to celebrate it too, not just an explicit
  // "Sync completions from Steam" click. Harmless to run on every fetch (not just the first) -
  // announceUnlock no-ops on an empty array, which is what a repeat fetch reports once the one-shot
  // badge is already unlocked.
  useEffect(() => {
    if (query.data) announceUnlock(query.data.unlockedBadges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  return { players: query.data?.players ?? [], isLoading: query.isLoading };
}
