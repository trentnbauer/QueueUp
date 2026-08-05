import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { badgesApi } from '../api/badges';
import { useAnnounceUnlock } from '../context/AchievementUnlockContext';
import styles from './AchievementsView.module.css';

/** QueueUp's own gamification panel (issue #489) - every badge in the catalog, always shown even
 * when locked (so there's something to aspire to, not just a list that only ever grows). Mostly
 * read-only, same tile-grid shape as CurrentlyPlayingView/BeatenView (emoji in place of cover art,
 * a rarity line in place of the status pill) - the live "trophy flies in" unlock moment itself
 * normally happens elsewhere, via AchievementUnlockContext, the instant an action's own response
 * reports a new unlock. The one interaction this view does have is "Refresh Achievements" (issue:
 * "I imported Switch games via Playnite but have no way to trigger the achievement again without
 * another import") - most badges only ever unlock live, off the specific action that earns them,
 * so anyone who did that thing before the relevant badge existed (or before this account's next
 * qualifying action happens to fire) has no other way to get credit for it short of re-doing it -
 * this calls POST /api/me/badges/refresh to re-derive whatever's currently, unambiguously true from
 * data already on file (see services/badges.ts's refreshBadges for exactly what that covers). */
export function AchievementsView() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['me', 'badges'],
    queryFn: badgesApi.list,
  });
  const announceUnlock = useAnnounceUnlock();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const { unlockedBadges } = await badgesApi.refresh();
      announceUnlock(unlockedBadges);
      await refetch();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Could not refresh achievements right now.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Achievements</h1>
          <p className={styles.hint}>Milestones across your Personal Shelf and every room you're in. Rarity is out of every QueueUp player.</p>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={handleRefresh}
          disabled={refreshing}
          title="Re-check for any badges you already qualify for but haven't been credited with yet"
        >
          {refreshing ? 'Checking…' : '🔄 Refresh Achievements'}
        </button>
      </div>
      {refreshError && <p className={styles.empty}>{refreshError}</p>}

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {isError && <p className={styles.empty}>Could not load this - try again in a moment.</p>}

      {data && (
        <div className={styles.grid}>
          {data.badges.map((badge) => {
            const unlocked = badge.unlockedAt !== null;
            return (
              <div key={badge.key} className={`${styles.tile} ${unlocked ? '' : styles.tileLocked}`} title={badge.description}>
                <div className={styles.emoji} aria-hidden="true">
                  {unlocked ? badge.emoji : '🔒'}
                </div>
                <span className={styles.name}>{badge.name}</span>
                <span className={styles.description}>{badge.description}</span>
                <span className={styles.rarity}>{badge.rarityPercent}% of players have this</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
