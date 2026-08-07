import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import styles from './BacklogInsightsView.module.css';

/** An insights view beyond Year in Review (issue #512): average time-to-beat, the single
 * most-neglected backlog game, and a backlog age distribution - all computed on demand from data
 * already on hand (PlayLog's per-session timestamps, and the same "collecting dust" neglect
 * threshold GameCard/Header already use), same read-only/no-scheduled-job shape as
 * AchievementsView/ProfileSettingsView's Year in Games section. */
export function BacklogInsightsView() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'backlog-insights'],
    queryFn: gamesApi.backlogInsights,
  });

  const maxBucketCount = data ? Math.max(1, ...data.ageDistribution.map((b) => b.count)) : 1;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Backlog Insights</h1>
      <p className={styles.hint}>
        How long games take you, calendar-wise, to go from Playing to Beaten, what's been sitting untouched the longest, and how old
        your backlog is - across your Personal Shelf and every room you're in.
      </p>

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {isError && <p className={styles.empty}>Could not load this - try again in a moment.</p>}

      {data && (
        <>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{data.averageDaysToBeat !== null ? `${data.averageDaysToBeat}d` : '—'}</span>
              <span className={styles.statLabel}>
                avg. calendar days from Playing to Beaten
                {data.finishedEntryCount > 0 &&
                  ` (${data.finishedEntryCount} play${data.finishedEntryCount === 1 ? 'through' : 'throughs'})`}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{data.averageHoursToBeat !== null ? `${data.averageHoursToBeat}h` : '—'}</span>
              <span className={styles.statLabel}>
                avg. active hours from Playing to Beaten (Steam playtime)
                {data.hoursTrackedEntryCount > 0 &&
                  ` (${data.hoursTrackedEntryCount} play${data.hoursTrackedEntryCount === 1 ? 'through' : 'throughs'})`}
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{data.backlogCount}</span>
              <span className={styles.statLabel}>game{data.backlogCount === 1 ? '' : 's'} in your backlog</span>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.subtitle}>Most neglected</div>
            {data.mostNeglectedGame ? (
              <div className={styles.neglectedCard}>
                <div
                  className={styles.neglectedCover}
                  style={data.mostNeglectedGame.coverImageUrl ? { backgroundImage: `url(${data.mostNeglectedGame.coverImageUrl})` } : undefined}
                >
                  {!data.mostNeglectedGame.coverImageUrl && <span className={styles.neglectedCoverFallback}>{data.mostNeglectedGame.title[0]?.toUpperCase()}</span>}
                </div>
                <div className={styles.neglectedDetail}>
                  <span className={styles.neglectedTitle}>{data.mostNeglectedGame.title}</span>
                  <span className={styles.neglectedMeta}>
                    <span aria-hidden="true">🕸</span> Untouched for {data.mostNeglectedGame.daysSinceActivity} days
                  </span>
                </div>
              </div>
            ) : (
              <p className={styles.empty}>Nothing's collecting dust yet - every backlog game has seen some activity recently.</p>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.subtitle}>Backlog age</div>
            {data.backlogCount === 0 ? (
              <p className={styles.empty}>Your backlog is empty.</p>
            ) : (
              <div className={styles.ageDistribution}>
                {data.ageDistribution.map((bucket) => (
                  <div key={bucket.label} className={styles.ageBarRow}>
                    <span className={styles.ageBarLabel}>{bucket.label}</span>
                    <div className={styles.ageBarTrack}>
                      <div className={styles.ageBarFill} style={{ width: `${(bucket.count / maxBucketCount) * 100}%` }} />
                    </div>
                    <span className={styles.ageBarCount}>{bucket.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
