import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GAME_STATUS_LABEL } from '../components/gameGridLogic';
import { gamesApi } from '../api/games';
import styles from './CurrentlyPlayingView.module.css';

/** Aggregates "Currently Playing" (and Play Next) across every room the user is in, plus their
 * Personal Shelf, into one view (issue #364) - someone in several rooms otherwise has to switch
 * into each one just to see what's active where. Read-only/navigational rather than reusing the
 * full interactive GameCard: `Game.status` is one shared field per room game, so acting on one
 * here (changing status, voting) would need the same room-scoped mutation wiring `useGames` does
 * per room, for every room at once - clicking through to the room itself is simpler and already
 * gets you the exact same interactive card. */
export function CurrentlyPlayingView() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'currently-playing'],
    queryFn: gamesApi.currentlyPlaying,
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Currently Playing</h1>
      <p className={styles.hint}>Everything marked Playing or Play Next, across your Personal Shelf and every room you're in.</p>

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {isError && <p className={styles.empty}>Could not load this - try again in a moment.</p>}
      {data && data.groups.length === 0 && <p className={styles.empty}>Nothing marked Playing or Play Next anywhere yet.</p>}

      {data?.groups.map((group) => (
        <div key={group.roomId ?? 'personal'} className={styles.group}>
          <div className={styles.groupTitle}>{group.roomName ?? 'Personal Shelf'}</div>
          <div className={styles.row}>
            {group.games.map((game) => (
              <Link
                key={game.id}
                to={group.roomId ? `/room/${group.roomId}` : '/'}
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
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
