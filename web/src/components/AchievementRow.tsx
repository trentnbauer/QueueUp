import type { PlayerAchievements } from '@queueup/shared';
import { AvatarBadge } from './AvatarBadge';
import styles from './AchievementRow.module.css';

interface AchievementRowProps {
  players: PlayerAchievements[];
  currentUserId: string;
}

/** Shows each player's Steam achievement progress on this game (issue: "grab achievement count
 * from Steam and add it to the cards modal") - same pill-row layout as VoteHeatmap, one pill per
 * player who has a usable Steam account and something to report. Renders nothing if the list is
 * empty (no Steam release, nobody's linked, or nobody's unlocked/has any achievements to show). */
export function AchievementRow({ players, currentUserId }: AchievementRowProps) {
  if (players.length === 0) return null;

  return (
    <div className={styles.row}>
      <div className={styles.label}>Achievements</div>
      <div className={styles.players}>
        {players.map((p) => {
          const isSelf = p.user.id === currentUserId;
          const pct = p.total > 0 ? Math.round((p.unlocked / p.total) * 100) : 0;
          return (
            <div
              key={p.user.id}
              className={styles.player}
              title={`${isSelf ? 'You' : p.user.displayName}: ${p.unlocked}/${p.total} achievements (${pct}%)`}
            >
              <AvatarBadge name={p.user.displayName} color={p.user.avatarColor} avatarUrl={p.user.avatarUrl} size={20} />
              <span className={styles.count}>
                {p.unlocked}/{p.total}
              </span>
              <span className={styles.barTrack}>
                <span className={styles.barFill} style={{ width: `${pct}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
