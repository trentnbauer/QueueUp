import type { DeletedRoomSummary } from '@queueup/shared';
import { Btn, Group, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Deleted rooms that can still be restored (#1103), with Restore and, for administrators, Delete
 * permanently. Renders nothing when there are none. */
export function DeletedRoomsList({
  rooms,
  busy,
  onRestore,
  onPurge,
}: {
  rooms: DeletedRoomSummary[];
  /** The id of the room an action is running on. */
  busy?: string | null;
  onRestore: (room: DeletedRoomSummary) => void;
  onPurge?: (room: DeletedRoomSummary) => void;
}) {
  const t = useT();
  if (rooms.length === 0) return null;
  return (
    <div style={st('display:flex;flex-direction:column;gap:8px')}>
      <Kicker>{t('room.deleted.title', { n: rooms.length })}</Kicker>
      <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted)')}>{t('room.deleted.hint')}</span>
      <Group>
        {rooms.map((r) => (
          <div key={r.id} style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-height:56px;padding:8px 10px 8px 16px;background:var(--surf)')}>
            <span aria-hidden style={st(`width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${r.accentColor}`)} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{r.name}</span>
              <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>
                {t(r.memberCount === 1 ? 'pages.admin.members.one' : 'pages.admin.members.other', { n: r.memberCount })} ·{' '}
                {t(r.gameCount === 1 ? 'pages.admin.games.one' : 'pages.admin.games.other', { n: r.gameCount })} ·{' '}
                {t('room.deleted.purgeOn', { date: new Date(r.purgeAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) })}
              </span>
            </span>
            <Btn kind="soft" height={32} padX={12} fontSize={12.5} disabled={busy === r.id} onClick={() => onRestore(r)}>
              {t('room.deleted.restore')}
            </Btn>
            {onPurge && (
              <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={busy === r.id} style={{ color: 'var(--danger)' }} onClick={() => onPurge(r)}>
                {t('room.deleted.purge')}
              </Btn>
            )}
          </div>
        ))}
      </Group>
    </div>
  );
}
