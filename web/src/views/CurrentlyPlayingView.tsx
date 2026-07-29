import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Game } from '@queueup/shared';
import { GAME_STATUS_LABEL } from '../components/gameGridLogic';
import { CurrentlyPlayingGameModal } from '../components/CurrentlyPlayingGameModal';
import { gamesApi } from '../api/games';
import styles from './CurrentlyPlayingView.module.css';

/** Aggregates "Currently Playing" (and Play Next) across every room the user is in, plus their
 * Personal Shelf, into one view (issue #364) - someone in several rooms otherwise has to switch
 * into each one just to see what's active where. Read-only/navigational rather than reusing the
 * full interactive GameCard: `Game.status` is one shared field per room game, so acting on one
 * here (changing status, voting) would need the same room-scoped mutation wiring `useGames` does
 * per room, for every room at once. Clicking a game opens a read-only preview instead (issue
 * #457) - jumping straight to the room was jarring for just wanting a quick look; the room
 * heading itself is still the one-click way to actually get into the room's interactive card. */
export function CurrentlyPlayingView() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'currently-playing'],
    queryFn: gamesApi.currentlyPlaying,
  });
  const [preview, setPreview] = useState<{ game: Game; roomId: string | null; roomName: string | null } | null>(null);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Currently Playing</h1>
      <p className={styles.hint}>Everything marked Playing or Play Next, across your Personal Shelf and every room you're in.</p>

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {isError && <p className={styles.empty}>Could not load this - try again in a moment.</p>}
      {data && data.groups.length === 0 && <p className={styles.empty}>Nothing marked Playing or Play Next anywhere yet.</p>}

      {data?.groups.map((group) => (
        <div key={group.roomId ?? 'personal'} className={styles.group}>
          <Link to={group.roomId ? `/room/${group.roomId}` : '/'} className={styles.groupTitle}>
            {group.roomName ?? 'Personal Shelf'}
          </Link>
          <div className={styles.row}>
            {group.games.map((game) => (
              <button
                key={game.id}
                type="button"
                onClick={() => setPreview({ game, roomId: group.roomId, roomName: group.roomName })}
                className={styles.tile}
                title={`${game.title} - ${GAME_STATUS_LABEL[game.status]}`}
              >
                <div
                  className={styles.cover}
                  style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
                >
                  {!game.coverImageUrl && <span className={styles.coverFallback}>{game.title[0]?.toUpperCase()}</span>}
                  <span className={`${styles.statusBadge} ${game.status === 'play_next' ? styles.statusBadgePlayNext : ''}`}>
                    {GAME_STATUS_LABEL[game.status]}
                  </span>
                </div>
                <span className={styles.tileTitle}>{game.title}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {preview && (
        <CurrentlyPlayingGameModal
          game={preview.game}
          roomId={preview.roomId}
          roomName={preview.roomName}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
