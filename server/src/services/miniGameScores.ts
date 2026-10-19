import { Prisma } from '@prisma/client';
import { LOBBY_GAME_IDS, MINIGAME_LAST_RUNS, MINIGAME_LEADERBOARD_SIZE, MINIGAME_NAMES, MINIGAME_SCORE_MAX, MINIGAME_WEEK_MS, formatMiniGameScore, lowerIsBetter, miniGameVersion, minScoreOf, scoreBeats, type LobbyGameId, type LobbyRunScore, type MiniGameBestsResponse, type MiniGameMeResponse, type MiniGameScorePeriod, type MiniGameScoreRow, type MiniGameScoreScope, type MiniGameScoreSource, type MiniGameScoresResponse } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { blockedIdsOf } from './blocks.js';
import { friendIdsOf } from './friendships.js';
import { notifyMiniGameBeaten } from './notifications.js';
import { wantsAlert } from './notificationPreferences.js';

export function isLobbyGameId(v: unknown): v is LobbyGameId {
  return typeof v === 'string' && (LOBBY_GAME_IDS as readonly string[]).includes(v);
}

/** Whether `score` could be a real result for the game (a whole number from 1 up to the game's limit). */
export function isPlausibleScore(game: LobbyGameId, score: unknown): score is number {
  return typeof score === 'number' && Number.isInteger(score) && score >= minScoreOf(game) && score <= MINIGAME_SCORE_MAX[game];
}

/** Saves a finished run for each real player. `verified` is whether the server saw the play happen (false for a lobby run of a game
 * that works each player out on their own device); only verified scores reach the high score lists. Scores that cannot be real are dropped, and a failure to
 * save never reaches the game (high scores are a bonus, never a reason for a lobby to break). */
export async function recordRunScores(game: LobbyGameId, source: MiniGameScoreSource, scores: LobbyRunScore[], roomId?: string, verified = true): Promise<void> {
  const data = scores.filter((s) => isPlausibleScore(game, s.score)).map((s) => ({ userId: s.userId, gameId: game, score: s.score, version: miniGameVersion(game), verified, source, roomId: roomId ?? null }));
  if (data.length === 0) return;
  // Each person's best before these runs, to tell which of their friends the new ones beat (only runs that reach the lists can).
  const before = verified ? await bestsOf(data.map((d) => d.userId), game).catch(() => null) : null;
  try {
    await prisma.miniGameScore.createMany({ data });
  } catch (err) {
    console.error('Could not save mini game scores', err);
    return;
  }
  if (before) void notifyBeatenFriends(game, data.map((d) => ({ userId: d.userId, score: d.score })), before);
}

/** The best score each of these people has for the game (this version, verified), by person; nobody with none. */
async function bestsOf(userIds: string[], game: LobbyGameId): Promise<Map<string, number>> {
  const lower = lowerIsBetter(game);
  const rows = await prisma.miniGameScore.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, gameId: game, version: miniGameVersion(game), verified: true, score: { gte: minScoreOf(game) } },
    _max: { score: true },
    _min: { score: true },
  });
  const bests = new Map<string, number>();
  for (const r of rows) {
    const v = lower ? r._min.score : r._max.score;
    if (v !== null) bests.set(r.userId, v);
  }
  return bests;
}

/** Tells each friend whose high score a new run beat. Only the run that first gets past a friend's best counts (if the person already
 * beat it with an earlier run, the friend has been told), and only friends who have a score, who have not blocked them, who were not in
 * the same run and who want the alert. Never throws. */
async function notifyBeatenFriends(game: LobbyGameId, runs: { userId: string; score: number }[], before: Map<string, number>): Promise<void> {
  try {
    for (const run of runs) {
      const previous = before.get(run.userId);
      const [friends, blocked] = await Promise.all([friendIdsOf(run.userId), blockedIdsOf(run.userId)]);
      // People who played this run with them have just seen the result, so they are not told.
      const candidates = friends.filter((id) => !blocked.includes(id) && !runs.some((r) => r.userId === id));
      if (candidates.length === 0) continue;
      const theirs = await bestsOf(candidates, game);
      const beaten = [...theirs].filter(([, best]) => scoreBeats(game, run.score, best) && !(previous !== undefined && scoreBeats(game, previous, best)));
      if (beaten.length === 0) continue;
      const me = await prisma.user.findUnique({ where: { id: run.userId }, select: { displayName: true } });
      for (const [friendId, best] of beaten) {
        if (!(await wantsAlert(friendId, 'minigame_beaten'))) continue;
        await notifyMiniGameBeaten(friendId, run.userId, game, `${me?.displayName ?? 'A friend'} beat your ${MINIGAME_NAMES[game]} high score: ${formatMiniGameScore(game, run.score)} to your ${formatMiniGameScore(game, best)}`);
      }
    }
  } catch (err) {
    console.error('Could not tell friends their mini game high score was beaten', err);
  }
}

interface BestRow {
  user_id: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  score: number;
  source: string;
  created_at: Date;
  rank: bigint;
  position: bigint;
}

/** Each person's best run for a game, best first, with ranks (equal scores share one). Banned people, and
 * anyone the viewer has blocked or been blocked by, are left out. Returns the top `limit` rows plus the
 * viewer's own row if they are further down. */
async function bestPerPerson(viewerId: string, game: LobbyGameId, scope: MiniGameScoreScope, period: MiniGameScorePeriod, limit: number): Promise<BestRow[]> {
  const since = period === 'week' ? new Date(Date.now() - MINIGAME_WEEK_MS) : null;
  const friends = scope === 'friends';
  const ids = friends ? [...(await friendIdsOf(viewerId)), viewerId] : [];
  const blocked = await blockedIdsOf(viewerId);
  // A time is better the smaller it is.
  const dir = lowerIsBetter(game) ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return prisma.$queryRaw<BestRow[]>`
    WITH best AS (
      SELECT DISTINCT ON (s.user_id) s.user_id, u.display_name, u.avatar_color, u.avatar_url, s.score, s.source, s.created_at
      FROM mini_game_scores s
      JOIN users u ON u.id = s.user_id
      WHERE s.game_id = ${game}
        AND (${since}::timestamptz IS NULL OR s.created_at >= ${since}::timestamptz)
        AND (NOT ${friends}::boolean OR s.user_id = ANY(${ids}::text[]))
        AND s.score >= ${minScoreOf(game)}
        AND s.version = ${miniGameVersion(game)}
        AND s.verified
        AND u.banned_at IS NULL
        AND NOT (s.user_id = ANY(${blocked}::text[]))
      ORDER BY s.user_id, s.score ${dir}, s.created_at ASC
    ),
    ranked AS (
      SELECT *, RANK() OVER (ORDER BY score ${dir}) AS rank, ROW_NUMBER() OVER (ORDER BY score ${dir}, created_at ASC) AS position
      FROM best
    )
    SELECT * FROM ranked WHERE position <= ${limit} OR user_id = ${viewerId} ORDER BY position`;
}

function toRow(r: BestRow, viewerId: string): MiniGameScoreRow {
  return {
    rank: Number(r.rank),
    userId: r.user_id,
    displayName: r.display_name,
    avatarColor: r.avatar_color,
    avatarUrl: r.avatar_url,
    score: r.score,
    at: r.created_at.toISOString(),
    source: r.source as MiniGameScoreSource,
    isMe: r.user_id === viewerId,
  };
}

export async function leaderboard(viewerId: string, game: LobbyGameId, scope: MiniGameScoreScope, period: MiniGameScorePeriod): Promise<MiniGameScoresResponse> {
  const rows = (await bestPerPerson(viewerId, game, scope, period, MINIGAME_LEADERBOARD_SIZE)).map((r) => toRow(r, viewerId));
  return { game, version: miniGameVersion(game), scope, period, rows, myRank: rows.find((r) => r.isMe)?.rank ?? null };
}

export async function myScores(viewerId: string, game: LobbyGameId): Promise<MiniGameMeResponse> {
  const [runs, best, friendRows, friendIds] = await Promise.all([
    prisma.miniGameScore.findMany({ where: { userId: viewerId, gameId: game, version: miniGameVersion(game), verified: true, score: { gte: minScoreOf(game) } }, orderBy: { createdAt: 'desc' }, take: MINIGAME_LAST_RUNS, select: { score: true, createdAt: true, source: true } }),
    prisma.miniGameScore.aggregate({ where: { userId: viewerId, gameId: game, version: miniGameVersion(game), verified: true, score: { gte: minScoreOf(game) } }, _max: { score: true }, _min: { score: true }, _count: { _all: true } }),
    bestPerPerson(viewerId, game, 'friends', 'all', 500),
    friendIdsOf(viewerId),
  ]);
  const mine = friendRows.find((r) => r.user_id === viewerId);
  // The nearest friend ahead of me: the closest score that beats mine (or, with no score yet, the closest to nothing).
  const lower = lowerIsBetter(game);
  const beats = (a: number, b: number) => (lower ? a < b : a > b);
  const ahead = friendRows.filter((r) => r.user_id !== viewerId && (!mine || beats(r.score, mine.score))).sort((a, b) => (lower ? b.score - a.score : a.score - b.score))[0];
  return {
    game,
    best: lower ? best._min.score : best._max.score,
    friendRank: mine ? Number(mine.rank) : null,
    friendCount: friendIds.length,
    runsPlayed: best._count._all,
    nextFriend: ahead ? { displayName: ahead.display_name, gap: Math.abs(ahead.score - (mine?.score ?? 0)) } : null,
    lastRuns: runs.map((r) => ({ score: r.score, at: r.createdAt.toISOString(), source: r.source as MiniGameScoreSource })),
  };
}

export async function myBests(viewerId: string): Promise<MiniGameBestsResponse> {
  const rows = await prisma.miniGameScore.groupBy({ by: ['gameId'], where: { userId: viewerId, OR: LOBBY_GAME_IDS.map((id) => ({ gameId: id, version: miniGameVersion(id), verified: true, score: { gte: minScoreOf(id) } })) }, _max: { score: true }, _min: { score: true } });
  const bests: MiniGameBestsResponse['bests'] = {};
  for (const r of rows) {
    if (!isLobbyGameId(r.gameId)) continue;
    const v = lowerIsBetter(r.gameId) ? r._min.score : r._max.score;
    if (v !== null) bests[r.gameId] = v;
  }
  return { bests };
}

/** Deletes high scores: one game's, or (with no game) every game's. Returns how many runs were removed. Ratings and everything
 * else stay. */
export async function resetScores(game?: LobbyGameId): Promise<number> {
  const { count } = await prisma.miniGameScore.deleteMany({ where: game ? { gameId: game } : {} });
  return count;
}
