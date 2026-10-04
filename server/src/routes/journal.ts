import type { FastifyInstance } from 'fastify';
import type { JournalEntry } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { requireMembership } from '../services/roomAccess.js';

const LIMIT = 300;

/** Builds journal entries for every play-log row on `where`'s games, newest first, with the
 * viewer's all-time playtime from their Steam or Playnite snapshots where there is one. */
async function journal(userId: string, where: { roomId?: string | { in: string[] } | null; OR?: object[] }): Promise<JournalEntry[]> {
  const logs = await prisma.playLog.findMany({
    where: { game: { ...where, archivedAt: null } },
    orderBy: { startedAt: 'desc' },
    take: LIMIT,
    include: { game: { select: { id: true, title: true, coverImageUrl: true, status: true, roomId: true, steamAppid: true, room: { select: { name: true } } } } },
  });
  const appIds = [...new Set(logs.map((l) => l.game.steamAppid).filter((id): id is number => id !== null))];
  const gameIds = [...new Set(logs.map((l) => l.game.id))];
  const [steam, playnite] = await Promise.all([
    appIds.length ? prisma.playtimeSnapshot.findMany({ where: { userId, steamAppId: { in: appIds } }, select: { steamAppId: true, playtimeMinutes: true } }) : [],
    gameIds.length ? prisma.playnitePlaytimeSnapshot.findMany({ where: { userId, gameId: { in: gameIds } }, select: { gameId: true, playtimeMinutes: true } }) : [],
  ]);
  const steamBy = new Map(steam.map((s) => [s.steamAppId, s.playtimeMinutes]));
  const playniteBy = new Map(playnite.map((s) => [s.gameId, s.playtimeMinutes]));
  return logs.map((l) => ({
    id: l.id,
    gameId: l.game.id,
    title: l.game.title,
    coverImageUrl: l.game.coverImageUrl,
    status: l.game.status,
    roomId: l.game.roomId,
    // For a shelf copy, PlayLog.roomName is the room it was beaten in (see the dialog's label).
    roomName: l.game.room?.name ?? l.roomName,
    startedAt: l.startedAt.toISOString(),
    finishedAt: l.finishedAt?.toISOString() ?? null,
    minutesPlayed: l.startPlaytimeMinutes != null && l.finishPlaytimeMinutes != null ? Math.max(0, l.finishPlaytimeMinutes - l.startPlaytimeMinutes) : null,
    totalMinutes: (l.game.steamAppid !== null ? steamBy.get(l.game.steamAppid) : undefined) ?? playniteBy.get(l.game.id) ?? null,
  }));
}

/** Play journal (#802): when each game was started and finished, and time played where known. */
export default async function journalRoutes(app: FastifyInstance) {
  // Everything the caller has played: their Personal Shelf plus every room they're in.
  app.get('/api/me/journal', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    const rooms = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true } });
    const entries = await journal(userId, { OR: [{ roomId: null, addedBy: userId }, { roomId: { in: rooms.map((r) => r.roomId) } }] });
    return { entries };
  });

  // Just one room's games.
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/journal', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    await requireMembership(request.params.roomId, userId);
    return { entries: await journal(userId, { roomId: request.params.roomId }) };
  });
}
