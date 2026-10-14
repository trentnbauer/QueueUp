import { useEffect, useRef, useState } from 'react';
import type { LobbyGameSnapshot, RoomMember } from '@queueup/shared';
import { useT } from '../../i18n';

const VISUALLY_HIDDEN: React.CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

/** Says what is happening in the arena to screen readers, since the arena is a picture: when a run is
 * about to start, who won, and when you are out. It speaks on changes (not every frame or every
 * countdown second). */
export function LiveAnnouncer({ game, me, members }: { game: LobbyGameSnapshot | null; me: string; members: RoomMember[] }) {
  const t = useT();
  const [message, setMessage] = useState('');
  const last = useRef<{ phase: string; run: number; mineAlive: boolean } | null>(null);

  useEffect(() => {
    if (!game) return;
    const mine = game.players.find((p) => p.id === me);
    const before = last.current;
    last.current = { phase: game.phase, run: game.run, mineAlive: mine?.alive ?? false };
    if (!before) return;
    if (game.phase !== before.phase || game.run !== before.run) {
      if (game.phase === 'countdown') setMessage(t('spin.lobby.announce.countdown', { n: game.run }));
      else if (game.phase === 'playing') setMessage(t('spin.lobby.announce.go'));
      else if (game.phase === 'over') {
        const winner = game.winnerId ? members.find((m) => m.user.id === game.winnerId)?.user.displayName ?? '' : '';
        setMessage(!game.winnerId ? t('spin.lobby.hud.nobody') : game.winnerId === me ? t('spin.lobby.hud.youWin') : t('spin.lobby.hud.nameWins', { name: winner }));
      }
    } else if (game.phase === 'playing' && before.mineAlive && mine && !mine.alive) {
      setMessage(t('spin.lobby.hud.youreOut'));
    }
  }, [game, me, members, t]);

  return (
    <div role="status" aria-live="polite" style={VISUALLY_HIDDEN}>
      {message}
    </div>
  );
}
