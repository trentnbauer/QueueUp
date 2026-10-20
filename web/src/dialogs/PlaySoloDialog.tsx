import { useEffect, useMemo, useState } from 'react';
import type { LobbyGameId, RoomMember } from '@queueup/shared';
import { miniGamesApi } from '../api/miniGames';
import { useAuth } from '../context/AuthContext';
import { LOBBY_GAME_VIEWS } from '../lobbyGames';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { LobbyPanel } from './LobbyPanel';

/** Play a mini game on your own, from the Mini games page: the game you picked there, right here. Each run's score
 * goes on the high score list. To play another game, close this and pick it on the page. */
export function PlaySoloDialog({ initialGame, onClose }: { initialGame: LobbyGameId; onClose: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const game = initialGame;
  // Practice runs on the server, in a private lobby of one, so the scores it saves are the server's own.
  const [lobby, setLobby] = useState<{ id: string; game: LobbyGameId } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let opened: string | null = null;
    setFailed(false);
    miniGamesApi
      .openLobby({ visibility: 'code', game, solo: true })
      .then((l) => {
        opened = l.id;
        if (cancelled) void miniGamesApi.closeLobby(l.id).catch(() => {});
        else setLobby({ id: l.id, game });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (opened) void miniGamesApi.closeLobby(opened).catch(() => {});
    };
  }, [game]);
  // The panel wants a list of room members: just you.
  const members = useMemo<RoomMember[]>(() => (user ? [{ roomId: '', user, role: 'room_master', joinedAt: '' }] : []), [user]);
  if (!user) return null;

  return (
    <Dialog
      onClose={onClose}
      header={
        <div style={st('display:flex;flex-direction:column;gap:2px;min-width:0;flex:1')}>
          <span style={st('font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accText)')}>{t('games.dialog.solo')}</span>
          <span style={st('font:700 22px var(--font-display);letter-spacing:-0.02em')}>{t(LOBBY_GAME_VIEWS[game].nameKey)}</span>
        </div>
      }
      ariaLabel={t('games.dialog.solo')}
      width={760}
      height="tall"
      gap={14}
    >
      {/* Keyed by lobby, so a fresh game starts with fresh effects. */}
      {lobby ? (
        <LobbyPanel key={lobby.id} lobbyId={lobby.id} soloGame={game} members={members} me={user.id} />
      ) : (
        <span style={st('padding:24px;text-align:center;color:var(--muted)')}>{failed ? t('games.open.failed') : t('spin.lobby.connecting')}</span>
      )}
    </Dialog>
  );
}
