import type { PlayerAchievements, User } from '@queueup/shared';
import { AvatarBadge } from './AvatarBadge';
import styles from './AchievementRow.module.css';

interface AchievementRowProps {
  players: PlayerAchievements[];
  currentUserId: string;
  /** True while the achievements query is still in flight (issue #371). */
  isLoading: boolean;
  /** Full room member list, same convention as VoteHeatmap - undefined on the Personal Shelf.
   * Only used here to pick the display variant (see below), not to list non-participants. */
  roomMembers?: User[];
  /** Game.currentPlaytimeMinutes - total Steam playtime, never resets. Personal-Shelf-only (null
   * for room games, which have no single unambiguous player), so only ever shown alongside the
   * detailed variant below. Null/undefined hides the figure rather than showing "0h". */
  playtimeMinutes?: number | null;
}

/** Shows each player's Steam achievement progress on this game (issue: "grab achievement count
 * from Steam and add it to the cards modal").
 *
 * In a room this is the compact pill-row layout VoteHeatmap uses (issue #371): one wrapping pill
 * per player showing % complete rather than a full-width progress bar, so a room with many
 * members doesn't grow the modal one bar-height per player. On the Personal Shelf there's only
 * ever one player to show, so issue #386 asked for the pre-#371 display back there: an exact
 * unlocked/total count plus a progress bar, one row.
 *
 * Issue #371's actual complaint was the Status buttons further down the modal shifting once this
 * data arrives - so both variants always render the same fixed-height slot rather than collapsing
 * to nothing while there's no data to show: a loading skeleton while the query is in flight, then
 * either the real row(s) (data present) or an equally-sized invisible spacer (query resolved with
 * nothing to show - no Steam release, nobody linked, or nobody's unlocked anything). Collapsing to
 * zero height in that last case would just move the same shift to a different moment - the instant
 * the query resolves empty - for every non-Steam game and every user with no Steam account linked. */
export function AchievementRow({ players, currentUserId, isLoading, roomMembers, playtimeMinutes }: AchievementRowProps) {
  const hasPlayers = players.length > 0;
  const isPersonal = roomMembers === undefined;
  const playtimeHours = playtimeMinutes != null ? Math.round((playtimeMinutes / 60) * 10) / 10 : null;

  return (
    <div className={styles.row}>
      <div className={styles.label}>
        Achievements
        {isPersonal && playtimeHours != null && <span className={styles.playtime}> · {playtimeHours}h played</span>}
      </div>
      <div className={isPersonal ? styles.playersDetailed : styles.players}>
        {isLoading ? (
          <div className={isPersonal ? styles.skeletonBar : styles.skeletonPill} aria-hidden="true" />
        ) : hasPlayers ? (
          players.map((p) => {
            const isSelf = p.user.id === currentUserId;
            const pct = p.total > 0 ? Math.round((p.unlocked / p.total) * 100) : 0;
            const title = `${isSelf ? 'You' : p.user.displayName}: ${p.unlocked}/${p.total} achievements (${pct}%)`;
            return isPersonal ? (
              <div key={p.user.id} className={styles.playerDetailed} title={title}>
                <AvatarBadge name={p.user.displayName} color={p.user.avatarColor} avatarUrl={p.user.avatarUrl} size={20} />
                <span className={styles.countDetailed}>
                  {p.unlocked}/{p.total}
                </span>
                <span className={styles.barTrack}>
                  <span className={styles.barFill} style={{ width: `${pct}%` }} />
                </span>
              </div>
            ) : (
              <div key={p.user.id} className={styles.player} title={title}>
                <AvatarBadge name={p.user.displayName} color={p.user.avatarColor} avatarUrl={p.user.avatarUrl} size={20} />
                <span className={styles.count}>{pct}%</span>
              </div>
            );
          })
        ) : (
          <div className={isPersonal ? styles.emptyPlaceholderDetailed : styles.emptyPlaceholder} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
