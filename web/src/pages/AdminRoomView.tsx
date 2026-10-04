import { useQuery } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS, SPIN_WHEEL_THEME_LABELS } from '@queueup/shared';
import { adminApi } from '../api/admin';
import { STATUS_LABEL } from '../lib/gameView';
import { Avatar, coverBg } from '../ui/primitives';
import { st } from '../ui/st';

const ROLE_LABEL = { room_master: 'Room Master', moderator: 'Moderator', member: 'Member' } as const;
const LABEL = 'font:600 11px var(--font-mono);letter-spacing:0.06em;color:var(--muted)';

/** A read-only look inside a room for administrators (#792): its settings, members and games.
 * Changing anything takes "Manage as Room Master". */
export function AdminRoomView({ roomId }: { roomId: string }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'room', roomId], queryFn: () => adminApi.room(roomId) });
  if (isLoading) return <div style={st('padding:14px 16px;background:var(--surf);color:var(--muted);font-size:13px')}>Loading…</div>;
  if (error || !data) return <div style={st('padding:14px 16px;background:var(--surf);color:var(--danger);font-size:13px')}>Couldn't load this room.</div>;
  const { room, members, games } = data;
  const settings: [string, string][] = [
    ['Platform', room.platform ? ROOM_PLATFORM_LABELS[room.platform] : 'Any platform'],
    ['Visibility', room.isPublic ? 'Public, anyone can join' : 'Invite only'],
    ['Invites', room.invitePermission === 'members' ? 'Any member' : 'Moderators and above'],
    ['New games', room.requireGameApproval ? 'Need approval' : 'Added directly'],
    ['Spin price limit', room.spinOwnershipMaxPrice ? `$${room.spinOwnershipMaxPrice}` : 'Owned only'],
    ['Spin type', SPIN_WHEEL_THEME_LABELS[room.spinWheelTheme]],
  ];
  return (
    <div style={st('display:flex;flex-direction:column;gap:14px;padding:14px 16px 16px;background:var(--surf)')}>
      <span style={st('font:500 12px var(--font-ui);color:var(--faint)')}>Read only. Choose "Manage as Room Master" to change anything.</span>
      <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px')}>
        {settings.map(([k, v]) => (
          <div key={k} style={st('display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:10px;background:var(--bg)')}>
            <span style={st(LABEL)}>{k.toUpperCase()}</span>
            <span style={st('font:500 13px var(--font-ui)')}>{v}</span>
          </div>
        ))}
      </div>
      <div style={st('display:flex;flex-direction:column;gap:6px')}>
        <span style={st(LABEL)}>MEMBERS · {members.length}</span>
        {members.map((m) => (
          <div key={m.user.id} style={st('display:flex;align-items:center;gap:10px')}>
            <Avatar name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={26} />
            <span style={st('flex:1;min-width:0;font:500 13.5px var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{m.user.displayName}</span>
            <span style={st('font:500 12px var(--font-ui);color:var(--muted)')}>{ROLE_LABEL[m.role]}</span>
          </div>
        ))}
      </div>
      <div style={st('display:flex;flex-direction:column;gap:6px')}>
        <span style={st(LABEL)}>GAMES · {games.length}</span>
        {games.length === 0 && <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>No games yet.</span>}
        {games.map((g) => (
          <div key={g.id} style={st('display:flex;align-items:center;gap:10px')}>
            <span aria-hidden style={st(`width:24px;height:32px;flex-shrink:0;border-radius:5px;background:${coverBg(g.title, g.coverImageUrl, 'small')}`)} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column')}>
              <span style={st('font:500 13.5px var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{g.title}</span>
              <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>
                {STATUS_LABEL[g.status] ?? g.status} · added by {g.addedByName}
              </span>
            </span>
            <span style={st('font:600 12px var(--font-mono);color:var(--muted)')}>{g.voteScore} votes</span>
          </div>
        ))}
      </div>
    </div>
  );
}
