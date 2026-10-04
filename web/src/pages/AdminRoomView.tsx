import { useQuery } from '@tanstack/react-query';
import { ROOM_PLATFORM_LABELS } from '@queueup/shared';
import { adminApi } from '../api/admin';
import { STATUS_LABEL } from '../lib/gameView';
import { Avatar, coverBg } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';
import { spinThemeLabel } from '../i18n/labels';

const LABEL = 'font:600 11px var(--font-mono);letter-spacing:0.06em;color:var(--muted)';

/** A read-only look inside a room for administrators (#792): its settings, members and games.
 * Changing anything takes "Manage as Room Master". */
export function AdminRoomView({ roomId }: { roomId: string }) {
  const t = useT();
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'room', roomId], queryFn: () => adminApi.room(roomId) });
  if (isLoading) return <div style={st('padding:14px 16px;background:var(--surf);color:var(--muted);font-size:13px')}>{t('common.loading')}</div>;
  if (error || !data) return <div style={st('padding:14px 16px;background:var(--surf);color:var(--danger);font-size:13px')}>{t('pages.adminRoom.loadFailed')}</div>;
  const { room, members, games } = data;
  const settings: [string, string][] = [
    [t('pages.adminRoom.platform'), room.platform ? ROOM_PLATFORM_LABELS[room.platform] : t('pages.admin.anyPlatform')],
    [t('pages.adminRoom.visibility'), room.isPublic ? t('pages.adminRoom.public') : t('pages.adminRoom.inviteOnly')],
    [t('pages.adminRoom.invites'), room.invitePermission === 'members' ? t('pages.adminRoom.anyMember') : t('pages.adminRoom.modsAndAbove')],
    [t('pages.adminRoom.newGames'), room.requireGameApproval ? t('pages.adminRoom.needApproval') : t('pages.adminRoom.addedDirectly')],
    [t('pages.adminRoom.spinPriceLimit'), room.spinOwnershipMaxPrice ? `$${room.spinOwnershipMaxPrice}` : t('pages.adminRoom.ownedOnly')],
    [t('pages.adminRoom.spinType'), spinThemeLabel(room.spinWheelTheme)],
  ];
  return (
    <div style={st('display:flex;flex-direction:column;gap:14px;padding:14px 16px 16px;background:var(--surf)')}>
      <span style={st('font:500 12px var(--font-ui);color:var(--faint)')}>{t('pages.adminRoom.readOnly')}</span>
      <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px')}>
        {settings.map(([k, v]) => (
          <div key={k} style={st('display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:10px;background:var(--bg)')}>
            <span style={st(LABEL)}>{k.toUpperCase()}</span>
            <span style={st('font:500 13px var(--font-ui)')}>{v}</span>
          </div>
        ))}
      </div>
      <div style={st('display:flex;flex-direction:column;gap:6px')}>
        <span style={st(LABEL)}>{t('pages.adminRoom.members', { n: members.length })}</span>
        {members.map((m) => (
          <div key={m.user.id} style={st('display:flex;align-items:center;gap:10px')}>
            <Avatar name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={26} />
            <span style={st('flex:1;min-width:0;font:500 13.5px var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{m.user.displayName}</span>
            <span style={st('font:500 12px var(--font-ui);color:var(--muted)')}>{t(`pages.adminRoom.role.${m.role}` as MessageKey)}</span>
          </div>
        ))}
      </div>
      <div style={st('display:flex;flex-direction:column;gap:6px')}>
        <span style={st(LABEL)}>{t('pages.adminRoom.games', { n: games.length })}</span>
        {games.length === 0 && <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{t('pages.adminRoom.noGames')}</span>}
        {games.map((g) => (
          <div key={g.id} style={st('display:flex;align-items:center;gap:10px')}>
            <span aria-hidden style={st(`width:24px;height:32px;flex-shrink:0;border-radius:5px;background:${coverBg(g.title, g.coverImageUrl, 'small')}`)} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column')}>
              <span style={st('font:500 13.5px var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{g.title}</span>
              <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>
                {t('pages.adminRoom.addedBy', { status: STATUS_LABEL[g.status] ?? g.status, name: g.addedByName })}
              </span>
            </span>
            <span style={st('font:600 12px var(--font-mono);color:var(--muted)')}>{t('pages.adminRoom.votes', { n: g.voteScore })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
