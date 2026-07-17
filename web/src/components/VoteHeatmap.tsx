import { VOTE_SCALE, type User, type VoteSummary } from '@squadqueue/shared';
import { AvatarBadge } from './AvatarBadge';
import styles from './VoteHeatmap.module.css';

interface VoteHeatmapProps {
  votes: VoteSummary[];
  currentUserId: string;
  /** Full room member list - when provided, also shows who hasn't voted yet (issue #163).
   * Undefined on the Personal Shelf, where there's no group coverage to show. */
  roomMembers?: User[];
}

/** Shows every voter's avatar + the emoji they cast, so "who voted for what" is visible at a
 * glance underneath the voting row - includes the current user's own vote (labeled "you") rather
 * than hiding it, since a results view that omits your own vote reads as incomplete.
 *
 * In a room, also shows members who *haven't* voted yet (dimmed, no emoji) - voting is the app's
 * main signal for what to play next, and it's easy for a hold-out to go unnoticed in a room with
 * several members otherwise. */
export function VoteHeatmap({ votes, currentUserId, roomMembers }: VoteHeatmapProps) {
  const nonVoters = roomMembers?.filter((member) => !votes.some((v) => v.user.id === member.id)) ?? [];
  if (votes.length === 0 && nonVoters.length === 0) return null;

  return (
    <div className={styles.row}>
      <div className={styles.label}>
        Squad votes{roomMembers ? ` · ${votes.length}/${roomMembers.length} voted` : ''}
      </div>
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
        {nonVoters.map((member) => (
          <div key={member.id} className={styles.nonVoter} title={`${member.displayName} hasn't voted yet`}>
            <AvatarBadge name={member.displayName} color={member.avatarColor} avatarUrl={member.avatarUrl} size={20} />
          </div>
        ))}
      </div>
    </div>
  );
}
