import type { RoomMember } from '@queueup/shared';
import { Avatar } from '../../ui/primitives';
import { st } from '../../ui/st';
import { useT } from '../../i18n';

const KICKER = 'font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accText)';

/** The top of the lobby panel. While a spin is waiting it says who is ready ("2 of 4 ready · play while
 * you wait") with a dot on each member (green when ready); on its own, from Room settings, it says who
 * is playing. On a phone it is one line above the arena. */
export function LobbyHeader({
  members,
  readyIds,
  playingIds,
  gameName,
  run,
  statusText,
  phone,
}: {
  members: RoomMember[];
  /** Members ready for the spin, or null when there is no spin. */
  readyIds: string[] | null;
  /** Members currently in the lobby. */
  playingIds: string[];
  gameName: string;
  run: number;
  statusText: string;
  phone: boolean;
}) {
  const t = useT();
  const dotted = new Set(readyIds ?? playingIds);
  const ready = readyIds ? members.filter((m) => readyIds.includes(m.user.id)).length : playingIds.length;

  if (phone) {
    const line = readyIds
      ? t('spin.lobby.phoneKicker.ready', { ready, total: members.length, run, game: gameName })
      : t('spin.lobby.phoneKicker.here', { n: playingIds.length, run, game: gameName });
    return (
      <div style={st('display:flex;justify-content:space-between;align-items:center;gap:8px')}>
        <span style={st(KICKER)}>{line}</span>
        <span style={st('font:500 11px var(--font-ui);color:var(--muted);white-space:nowrap')}>{statusText}</span>
      </div>
    );
  }

  return (
    <div style={st('display:flex;justify-content:space-between;align-items:center;gap:14px')}>
      <div style={st('display:flex;flex-direction:column;gap:4px;min-width:0')}>
        <span style={st(KICKER)}>{readyIds ? t('spin.lobby.waitingRoom') : t('spin.lobby.miniGames')}</span>
        <span style={st('font:600 14px var(--font-ui)')}>{readyIds ? t('spin.lobby.readyLine', { ready, total: members.length }) : statusText}</span>
      </div>
      <div style={st('display:flex;gap:6px;flex-shrink:0')}>
        {members.map((m) => {
          const on = dotted.has(m.user.id);
          return (
            <span key={m.user.id} style={st(`position:relative;display:flex;opacity:${on ? 1 : 0.55}`)}>
              <Avatar name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={28} />
              <span aria-hidden="true" style={st(`position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg);background:${on ? 'var(--mint)' : 'var(--rank)'}`)} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
