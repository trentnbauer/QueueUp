import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { Game } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { cardStatusLabel } from '../game/card/statusLabel';
import { Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

export const ROOMS_PLAYING_QUERY_KEY = ['games', 'rooms-playing'];

/** The games being played in each of your rooms right now (status Playing), grouped by room, for the shelf's "In rooms" tab. */
export function useRoomsPlaying() {
  return useQuery({
    queryKey: ROOMS_PLAYING_QUERY_KEY,
    queryFn: async () => {
      const { groups } = await gamesApi.currentlyPlaying();
      return groups
        .filter((g) => g.roomId !== null)
        .map((g) => ({ roomId: g.roomId as string, roomName: g.roomName ?? '', games: g.games.filter((x) => x.status === 'playing') }))
        .filter((g) => g.games.length > 0);
    },
    staleTime: 30_000,
  });
}

/** The shelf's "In rooms" tab: tap a game to go to its room and open its card. */
export function RoomsPlayingList() {
  const t = useT();
  const ui = useUi();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useRoomsPlaying();

  function open(roomId: string, game: Game) {
    ui.selectGame(null);
    navigate(`/room/${roomId}`);
    ui.selectGame(game.id);
  }

  if (isLoading) return <div style={st('padding:36px 12px;text-align:center;font:500 14.5px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</div>;
  if (isError) return <div style={st('padding:36px 12px;text-align:center;font:500 14.5px var(--font-ui);color:var(--muted)')}>{t('home.inRooms.failed')}</div>;
  const groups = data ?? [];
  if (groups.length === 0) return <div style={st('padding:36px 12px;text-align:center;font:500 14.5px var(--font-ui);color:var(--muted)')}>{t('home.inRooms.none')}</div>;

  return (
    <div style={st('display:flex;flex-direction:column;gap:16px')}>
      {groups.map((group) => (
        <div key={group.roomId} style={st('display:flex;flex-direction:column;gap:6px')}>
          <span style={st('font:600 11.5px var(--font-mono);letter-spacing:0.08em;color:var(--muted);padding:0 4px;text-transform:uppercase')}>{group.roomName}</span>
          {group.games.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => open(group.roomId, g)}
              className="hv-surf2"
              style={st('display:flex;align-items:center;gap:12px;min-height:60px;padding:8px 14px 8px 10px;border:none;border-radius:14px;background:var(--surf);color:var(--text);text-align:left')}
            >
              <Cover title={g.title} url={g.coverImageUrl} width={36} radius={7} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 14.5px var(--font-ui);overflow-wrap:anywhere')}>{g.title}</span>
                <span style={st('font:500 12px var(--font-ui);color:var(--accText)')}>{cardStatusLabel(g.status)}</span>
              </span>
              <span aria-hidden style={st('color:var(--faint);font-size:18px')}>›</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
