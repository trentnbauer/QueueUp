import type { ReactNode } from 'react';
import type { LobbyGameSnapshot, RoomMember } from '@queueup/shared';
import { Avatar } from '../../ui/primitives';
import { st } from '../../ui/st';
import { useT } from '../../i18n';

const KICKER = 'font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase';
const RING = '0 0 0 2px var(--sheet), 0 0 0 3.5px var(--acc)';

/** Who has won how many runs since people started playing, as bars (a row each on a desktop, a
 * column each on a phone). Sorted by wins; someone who is out of the current run is dimmed. */
export function WinChart({ game, members, me, phone, aside }: { game: LobbyGameSnapshot; members: RoomMember[]; me: string; phone: boolean; aside?: ReactNode }) {
  const t = useT();
  const byId = new Map(members.map((m) => [m.user.id, m.user]));
  const players = [...game.players].sort((a, b) => b.wins - a.wins);
  const max = Math.max(1, ...players.map((p) => p.wins));
  const left = players.filter((p) => p.alive).length;
  const running = game.phase === 'playing';
  const heading = running ? t('spin.lobby.wins.left', { n: left, total: players.length }) : t('spin.lobby.wins.run', { n: game.run });

  const status = (p: (typeof players)[number]): { text: string; color: string } => {
    if (game.phase === 'over' && game.winnerId === p.id) return { text: t('spin.lobby.wins.winner'), color: 'var(--star)' };
    if (running) return p.alive ? { text: t('spin.lobby.wins.meters', { n: game.meters }), color: 'var(--muted)' } : { text: t('spin.lobby.wins.out', { n: p.meters }), color: 'var(--danger)' };
    return { text: t('spin.lobby.wins.ready'), color: 'var(--faint)' };
  };

  if (phone) {
    const shown = players.slice(0, 5);
    return (
      <div style={st('display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:16px;background:var(--bg)')}>
        <div style={st(`display:flex;justify-content:space-between;${KICKER};color:var(--faint)`)}>
          <span>{t('spin.lobby.wins.title')}</span>
          <span>{heading}</span>
        </div>
        <div style={st('display:flex;gap:12px;align-items:flex-end')}>
          <div style={st('flex:1;min-width:0;display:flex;gap:10px;align-items:flex-end')}>
          {shown.map((p) => {
            const user = byId.get(p.id);
            return (
              <div key={p.id} style={st(`flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;opacity:${p.alive || !running ? 1 : 0.45}`)}>
                <span style={st('font:600 12px var(--font-mono)')}>{p.wins}</span>
                <span style={st(`width:100%;max-width:28px;height:${8 + (p.wins / max) * 52}px;border-radius:8px 8px 3px 3px;background:${user?.avatarColor ?? '#8b5cf6'};transition:height .5s cubic-bezier(.2,.8,.3,1)`)} />
                <Avatar name={user?.displayName ?? '?'} color={user?.avatarColor ?? '#8b5cf6'} avatarUrl={user?.avatarUrl} size={24} style={p.id === me ? { boxShadow: RING } : undefined} />
              </div>
            );
          })}
          </div>
          {aside && <div style={st('flex:0 0 38%;padding-left:12px;border-left:1px solid var(--chip);display:flex;flex-direction:column;gap:6px')}>
            <span style={st('font:500 9.5px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--faint)')}>{t('spin.lobby.history.short')}</span>
            {aside}
          </div>}
        </div>
      </div>
    );
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <div style={st(`display:flex;justify-content:space-between;${KICKER};color:var(--faint)`)}>
        <span>{t('spin.lobby.wins.title')}</span>
        <span>{heading}</span>
      </div>
      {players.map((p) => {
        const user = byId.get(p.id);
        const s = status(p);
        return (
          <div key={p.id} style={st(`display:grid;grid-template-columns:28px 1fr 22px;gap:10px;align-items:center;opacity:${p.alive || !running ? 1 : 0.45}`)}>
            <Avatar name={user?.displayName ?? '?'} color={user?.avatarColor ?? '#8b5cf6'} avatarUrl={user?.avatarUrl} size={28} style={p.id === me ? { boxShadow: RING } : undefined} />
            <div style={st('min-width:0;display:flex;flex-direction:column;gap:5px')}>
              <div style={st('display:flex;justify-content:space-between;gap:8px')}>
                <span style={st('font:600 13px var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{user?.displayName ?? '?'}</span>
                <span style={st(`font:500 11px var(--font-mono);color:${s.color};white-space:nowrap`)}>{s.text}</span>
              </div>
              <div style={st('height:6px;border-radius:3px;background:var(--chip);overflow:hidden')}>
                <div style={st(`height:100%;width:${(p.wins / max) * 100}%;background:${user?.avatarColor ?? '#8b5cf6'};transition:width .5s cubic-bezier(.2,.8,.3,1)`)} />
              </div>
            </div>
            <span style={st('font:600 14px var(--font-mono);text-align:right')}>{p.wins}</span>
          </div>
        );
      })}
    </div>
  );
}
