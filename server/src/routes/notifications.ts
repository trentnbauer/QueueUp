import type { FastifyInstance } from 'fastify';
import type { AttentionSummary } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { requireMembership } from '../services/roomAccess.js';
import { getNotificationFeed, getNotificationSummary, markAllNotificationsRead, markNotificationRead, markRoomNotificationsRead } from '../services/notifications.js';

// The summary is polled by every signed-in client (see POLL_INTERVAL_MS in useNotifications.ts)
// on top of normal interactive use, so its limit is looser than the other three, which are only
// ever hit by a direct user action (opening the flyout, marking read, visiting a room).
const POLLED_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };
const INTERACTIVE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };

export default async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', { config: { rateLimit: INTERACTIVE_RATE_LIMIT } }, async (request) => {
    const userId = await request.requireAuth();
    const notifications = await getNotificationFeed(userId);
    return { notifications };
  });

  app.get('/api/notifications/summary', { config: { rateLimit: POLLED_RATE_LIMIT } }, async (request) => {
    const userId = await request.requireAuth();
    const summary = await getNotificationSummary(userId);
    return summary;
  });

  // What still needs the caller in each room (issue: room dots in the v2 UI) - games they haven't
  // voted on yet, and (Room Master / Moderator) suggestions waiting for approval. Polled alongside
  // the notification summary, so it shares that route's looser limit.
  app.get('/api/me/attention', { config: { rateLimit: POLLED_RATE_LIMIT } }, async (request) => {
    const userId = await request.requireAuth();
    const memberships = await prisma.roomMember.findMany({ where: { userId }, select: { roomId: true, role: true } });
    const roomIds = memberships.map((m) => m.roomId);
    const managerRoomIds = memberships.filter((m) => m.role !== 'member').map((m) => m.roomId);

    const [unvoted, suggestions] = await Promise.all([
      roomIds.length
        ? prisma.game.groupBy({
            by: ['roomId'],
            where: {
              roomId: { in: roomIds },
              archivedAt: null,
              status: { in: ['backlog', 'wishlist', 'play_next'] },
              votes: { none: { userId } },
            },
            _count: { _all: true },
          })
        : [],
      managerRoomIds.length
        ? prisma.gameSuggestion.groupBy({ by: ['roomId'], where: { roomId: { in: managerRoomIds } }, _count: { _all: true } })
        : [],
    ]);
    const toVote = new Map(unvoted.map((r) => [r.roomId, r._count._all]));
    const toApprove = new Map(suggestions.map((r) => [r.roomId, r._count._all]));

    const summary: AttentionSummary = {
      rooms: roomIds.map((roomId) => ({ roomId, toVote: toVote.get(roomId) ?? 0, toApprove: toApprove.get(roomId) ?? 0 })),
    };
    return summary;
  });

  app.post('/api/notifications/read-all', { config: { rateLimit: INTERACTIVE_RATE_LIMIT } }, async (request, reply) => {
    const userId = await request.requireAuth();
    await markAllNotificationsRead(userId);
    reply.status(204);
    return null;
  });

  app.post<{ Params: { id: string } }>(
    '/api/notifications/:id/read',
    { config: { rateLimit: INTERACTIVE_RATE_LIMIT } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      await markNotificationRead(request.params.id, userId);
      reply.status(204);
      return null;
    },
  );

  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/notifications/read',
    { config: { rateLimit: INTERACTIVE_RATE_LIMIT } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireMembership(roomId, userId);
      await markRoomNotificationsRead(roomId, userId);
      reply.status(204);
      return null;
    },
  );
}
