import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Game } from '@queueup/shared';
import { GAME_STATUS_LABEL } from '../components/gameGridLogic';
import { CurrentlyPlayingGameModal } from '../components/CurrentlyPlayingGameModal';
import { gamesApi } from '../api/games';
// Reuses CurrentlyPlayingView's own styles (same tile-grid-of-games-grouped-by-room shape) rather
// than duplicating an identical stylesheet under a new name.
import styles from './CurrentlyPlayingView.module.css';

/** Aggregates Beaten (and Replay) across every room the user is in, plus their Personal Shelf,
 * into one view (issue #481) - "an easy way to display my beaten list, including communal rooms,"
 * the same problem #364's Currently Playing dashboard already solved for Playing/Play Next, so
 * this mirrors it exactly. Read-only/navigational for the same reason as CurrentlyPlayingView:
 * acting on a room game needs that room's own scoped mutation wiring, which this cross-room view
 * has no single room context to provide - clicking a game opens a read-only preview instead, same
 * CurrentlyPlayingGameModal (it's generic over any game/room, not tied to "Playing" specifically).
 * Replay joins Done here for the same reason BeatenStrip.tsx groups them together on the shelf
 * itself: a Replay is by definition already-beaten. */
export function BeatenView() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'beaten'],
    queryFn: gamesApi.beaten,
  });
  const [preview, setPreview] = useState<{ game: Game; roomId: string | null; roomName: string | null } | null>(null);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Beaten</h1>
      <p className={styles.hint}>Everything marked Beaten or queued for Replay, across your Personal Shelf and every room you're in.</p>

      {isLoading && <p className={styles.empty}>Loading…</p>}
      {isError && <p className={styles.empty}>Could not load this - try again in a moment.</p>}
      {data && data.groups.length === 0 && <p className={styles.empty}>Nothing marked Beaten anywhere yet.</p>}

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
