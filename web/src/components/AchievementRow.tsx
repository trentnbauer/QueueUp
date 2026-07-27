import type { PlayerAchievements } from '@queueup/shared';
import { AvatarBadge } from './AvatarBadge';
import styles from './AchievementRow.module.css';

interface AchievementRowProps {
  players: PlayerAchievements[];
  currentUserId: string;
  /** True while the achievements query is still in flight (issue #371). */
  isLoading: boolean;
}

/** Shows each player's Steam achievement progress on this game (issue: "grab achievement count
 * from Steam and add it to the cards modal") - same compact pill-row layout as VoteHeatmap
 * (issue #371 asked for these to look alike): one wrapping pill per player who has a usable Steam
 * account and something to report, showing % complete rather than a full-width progress bar, so a
 * room with many members doesn't grow the modal one bar-height per player.
 *
 * Issue #371's actual complaint was the Status buttons further down the modal shifting once this
 * data arrives - so this always renders the same fixed-height slot rather than collapsing to
 * nothing while there's no data to show: a loading skeleton pill while the query is in flight,
 * then either real pills (data present) or an equally-sized invisible spacer (query resolved with
 * nothing to show - no Steam release, nobody linked, or nobody's unlocked anything). Collapsing to
 * zero height in that last case would just move the same shift to a different moment - the instant
 * the query resolves empty - for every non-Steam game and every user with no Steam account linked. */
export function AchievementRow({ players, currentUserId, isLoading }: AchievementRowProps) {
  const hasPlayers = players.length > 0;

  return (
    <div className={styles.row}>
      <div className={styles.label}>Achievements</div>
      <div className={styles.players}>
        {isLoading ? (
          <div className={styles.skeletonPill} aria-hidden="true" />
        ) : hasPlayers ? (
          players.map((p) => {
            const isSelf = p.user.id === currentUserId;
            const pct = p.total > 0 ? Math.round((p.unlocked / p.total) * 100) : 0;
            return (
              <div
                key={p.user.id}
                className={styles.player}
                title={`${isSelf ? 'You' : p.user.displayName}: ${p.unlocked}/${p.total} achievements (${pct}%)`}
              >
                <AvatarBadge name={p.user.displayName} color={p.user.avatarColor} avatarUrl={p.user.avatarUrl} size={20} />
                <span className={styles.count}>{pct}%</span>
              </div>
            );
          })
        ) : (
          <div className={styles.emptyPlaceholder} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
