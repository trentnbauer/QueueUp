import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BadgeDefinition } from '@queueup/shared';
import { TrophyBurst, TROPHY_BURST_DURATION_MS } from '../components/TrophyBurst';

type AnnounceUnlockFn = (badges: BadgeDefinition[]) => void;

const AchievementUnlockContext = createContext<AnnounceUnlockFn | null>(null);

interface QueuedUnlock {
  id: number;
  badge: BadgeDefinition;
}

// Monotonic, outside React state on purpose - these ids only need to be stable/unique per queued
// item (for TrophyBurst's remount key below), not reactive.
let nextUnlockId = 0;

/** Announces newly-unlocked QueueUp badges (issue #489) with a celebratory TrophyBurst, from
 * anywhere in the app - every mutation whose response can include `unlockedBadges` (a status
 * change, a room join, a Spin the Wheel ready-up, ...) calls announceUnlock() from its own
 * onSuccess. Queued rather than shown all at once: two badges unlocking from the same action (or
 * two actions in quick succession) show one burst after another instead of overlapping. Mounted
 * once near the app root (see main.tsx) - the burst itself is a fixed-position overlay, not scoped
 * to whatever component happened to trigger it. */
export function AchievementUnlockProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedUnlock[]>([]);

  const announceUnlock = useCallback<AnnounceUnlockFn>((badges) => {
    if (badges.length === 0) return;
    setQueue((prev) => [...prev, ...badges.map((badge) => ({ id: nextUnlockId++, badge }))]);
  }, []);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (!current) return;
    const timeout = setTimeout(() => setQueue((prev) => prev.slice(1)), TROPHY_BURST_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [current]);

  return (
    <AchievementUnlockContext.Provider value={announceUnlock}>
      {children}
      {current && <TrophyBurst key={current.id} badge={current.badge} />}
    </AchievementUnlockContext.Provider>
  );
}

export function useAnnounceUnlock(): AnnounceUnlockFn {
  const announceUnlock = useContext(AchievementUnlockContext);
  if (!announceUnlock) throw new Error('useAnnounceUnlock must be used within an AchievementUnlockProvider');
  return announceUnlock;
}
