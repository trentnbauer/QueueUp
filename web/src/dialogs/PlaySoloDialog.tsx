import { useMemo, useState } from 'react';
import { LOBBY_GAME_IDS, type LobbyGameId, type RoomMember } from '@queueup/shared';
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
      {/* Keyed by game, so switching starts a fresh game with fresh effects. */}
      <LobbyPanel key={game} practiceGame={game} members={members} me={user.id} />
    </Dialog>
  );
}
