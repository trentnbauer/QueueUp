import { useQuery } from '@tanstack/react-query';
import { badgesApi } from '../api/badges';
import styles from './AchievementsView.module.css';

/** QueueUp's own gamification panel (issue #489) - every badge in the catalog, always shown even
 * when locked (so there's something to aspire to, not just a list that only ever grows). Read-
 * only/no interactions of its own, same tile-grid shape as CurrentlyPlayingView/BeatenView (emoji
 * in place of cover art, a rarity line in place of the status pill) - the live "trophy flies in"
 * unlock moment itself happens elsewhere, via AchievementUnlockContext, the instant an action's own
 * response reports a new unlock; this view is just the at-a-glance catalog/rarity browser. */
export function AchievementsView() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'badges'],
    queryFn: badgesApi.list,
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Achievements</h1>
      <p className={styles.hint}>Milestones across your Personal Shelf and every room you're in. Rarity is out of every QueueUp player.</p>

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
