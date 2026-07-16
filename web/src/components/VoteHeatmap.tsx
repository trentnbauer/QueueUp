import { VOTE_SCALE, type VoteSummary } from '@squadqueue/shared';
import { AvatarBadge } from './AvatarBadge';

interface VoteHeatmapProps {
  votes: VoteSummary[];
  currentUserId: string;
}

export function VoteHeatmap({ votes, currentUserId }: VoteHeatmapProps) {
  const others = votes.filter((v) => v.user.id !== currentUserId);
  if (others.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 1 }}>
      {others.map((vote) => (
        <div key={vote.user.id} title={vote.user.displayName} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <AvatarBadge name={vote.user.displayName} color={vote.user.avatarColor} avatarUrl={vote.user.avatarUrl} size={16} />
          <span style={{ fontSize: 13 }}>{VOTE_SCALE[vote.value]}</span>
        </div>
      ))}
    </div>
  );
}
