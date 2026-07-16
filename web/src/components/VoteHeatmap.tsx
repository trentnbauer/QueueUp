import { VOTE_SCALE, type VoteSummary } from '@squadqueue/shared';
import { AvatarBadge } from './AvatarBadge';
import styles from './VoteHeatmap.module.css';

interface VoteHeatmapProps {
  votes: VoteSummary[];
  currentUserId: string;
}

/** Shows every voter's avatar + the emoji they cast, so "who voted for what" is visible at a
 * glance underneath the voting row - includes the current user's own vote (labeled "you") rather
 * than hiding it, since a results view that omits your own vote reads as incomplete. */
export function VoteHeatmap({ votes, currentUserId }: VoteHeatmapProps) {
  if (votes.length === 0) return null;

  return (
    <div className={styles.row}>
      <div className={styles.label}>Squad votes</div>
      <div className={styles.voters}>
        {votes.map((vote) => {
          const isSelf = vote.user.id === currentUserId;
          return (
            <div key={vote.user.id} className={styles.voter} title={isSelf ? 'You' : vote.user.displayName}>
              <AvatarBadge name={vote.user.displayName} color={vote.user.avatarColor} avatarUrl={vote.user.avatarUrl} size={20} />
              <span className={styles.value}>{VOTE_SCALE[vote.value]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
