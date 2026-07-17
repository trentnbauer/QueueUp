import type { FastifyInstance } from 'fastify';
import { requireMembership } from '../services/roomAccess.js';
import { getNotificationFeed, getNotificationSummary, markAllNotificationsRead, markRoomNotificationsRead } from '../services/notifications.js';

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

  app.post('/api/notifications/read-all', { config: { rateLimit: INTERACTIVE_RATE_LIMIT } }, async (request, reply) => {
    const userId = await request.requireAuth();
    await markAllNotificationsRead(userId);
    reply.status(204);
    return null;
  });

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
