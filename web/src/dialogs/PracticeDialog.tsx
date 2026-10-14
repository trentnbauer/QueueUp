import { useMemo, useState } from 'react';
import { LOBBY_GAME_IDS, type LobbyGameId, type RoomMember } from '@queueup/shared';
import { useAuth } from '../context/AuthContext';
import { LOBBY_GAME_VIEWS } from '../lobbyGames';
import { Dialog } from '../ui/Dialog';
import { ChipToggle } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { LobbyPanel } from './LobbyPanel';

/** Practise the room mini games on your own, from the Personal Shelf's settings: pick a game and play it
 * right here, with no room, no one else and nothing saved. */
export function PracticeDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const [game, setGame] = useState<LobbyGameId>(LOBBY_GAME_IDS[0]);
  // The panel wants a list of room members: just you.
  const members = useMemo<RoomMember[]>(() => (user ? [{ roomId: '', user, role: 'room_master', joinedAt: '' }] : []), [user]);
  if (!user) return null;

  return (
    <Dialog onClose={onClose} title={t('practice.title')} width={720} gap={14}>
      <div style={st('display:flex;flex-wrap:wrap;gap:6px')} role="group" aria-label={t('practice.pick')}>
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
