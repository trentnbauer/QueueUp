import { LOBBY_GAME_IDS, lobbyPickWeights, type LobbyGameId } from '@queueup/shared';
import { prisma } from '../db/client.js';

/** Plays are counted over this long, so a new game's boost fades as it catches up and an old one gets another look. */
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** How often the counts are read again. A lobby picks a game at most every few seconds, so it never waits on the database. */
const REFRESH_MS = 5 * 60 * 1000;

let weights: Partial<Record<LobbyGameId, number>> = {};
let loadedAt = 0;
let loading = false;

/** How many runs of each game were played in the window. A run saved to the high score table is one row per
 * person with the same time, room and source, so distinct runs are counted, not rows. Waiting room runs count too. */
export async function countRecentPlays(now = Date.now()): Promise<Partial<Record<LobbyGameId, number>>> {
  const since = new Date(now - WINDOW_MS);
  const rows = await prisma.$queryRaw<{ game_id: string; plays: bigint }[]>`
    SELECT game_id, COUNT(DISTINCT (COALESCE(room_id, ''), source, created_at)) AS plays
    FROM mini_game_scores
    WHERE created_at >= ${since}
    GROUP BY game_id`;
  const plays: Partial<Record<LobbyGameId, number>> = {};
  for (const r of rows) if ((LOBBY_GAME_IDS as readonly string[]).includes(r.game_id)) plays[r.game_id as LobbyGameId] = Number(r.plays);
  return plays;
}

/** How likely each game is to come up in a lobby, from the last read of the play counts (even until the first read
 * finishes, or if reading fails). Reads again in the background once the last read is old, never on the pick itself. */
export function playWeights(now = Date.now()): Partial<Record<LobbyGameId, number>> {
  if (!loading && now - loadedAt > REFRESH_MS) {
    loading = true;
    loadedAt = now;
    countRecentPlays(now)
      .then((plays) => {
        weights = lobbyPickWeights(plays);
      })
      .catch((err) => console.error('Could not read mini game play counts', err))
      .finally(() => {
        loading = false;
      });
  }
  return weights;
}
