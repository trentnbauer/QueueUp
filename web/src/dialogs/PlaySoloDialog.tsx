import { useEffect, useMemo, useState } from 'react';
import { LOBBY_GAME_IDS, type LobbyGameId, type RoomMember } from '@queueup/shared';
import { miniGamesApi } from '../api/miniGames';
import { useAuth } from '../context/AuthContext';
import { LOBBY_GAME_VIEWS } from '../lobbyGames';
import { Dialog } from '../ui/Dialog';
import { useIsMobile } from '../ui/useLayout';
import { ChipToggle } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { LobbyPanel } from './LobbyPanel';

/** Play a mini game on your own, from the Mini games page: pick a game and play it right here. Each run's
 * score goes on the high score list. */
export function PlaySoloDialog({ initialGame, onClose }: { initialGame: LobbyGameId; onClose: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const phone = useIsMobile();
  const [game, setGame] = useState<LobbyGameId>(initialGame);
  // Practice runs on the server, in a private lobby of one, so the scores it saves are the server's own. Picking
  // another game opens a fresh one (which replaces the last).
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
    <Dialog onClose={onClose} title={t('games.dialog.solo')} width={760} height="tall" gap={14}>
      <div style={st(`display:flex;gap:6px;${phone ? 'overflow-x:auto;margin:0 -16px;padding:0 16px' : 'flex-wrap:wrap'}`)} role="group" aria-label={t('practice.pick')}>
        {LOBBY_GAME_IDS.map((id) => (
          <ChipToggle key={id} on={game === id} height={36} onClick={() => setGame(id)}>
            {t(LOBBY_GAME_VIEWS[id].nameKey)}
          </ChipToggle>
        ))}
      </div>
      {/* Keyed by lobby, so switching starts a fresh game with fresh effects. */}
      {lobby && lobby.game === game ? (
        <LobbyPanel key={lobby.id} lobbyId={lobby.id} soloGame={game} members={members} me={user.id} />
      ) : (
        <span style={st('padding:24px;text-align:center;color:var(--muted)')}>{failed ? t('games.open.failed') : t('spin.lobby.connecting')}</span>
      )}
    </Dialog>
  );
}
