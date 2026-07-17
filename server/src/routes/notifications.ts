import type { FastifyInstance } from 'fastify';
import { requireMembership } from '../services/roomAccess.js';
import { getNotificationFeed, getNotificationSummary, markAllNotificationsRead, markRoomNotificationsRead } from '../services/notifications.js';

export default async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', async (request) => {
    const userId = await request.requireAuth();
    const notifications = await getNotificationFeed(userId);
    return { notifications };
  });

  app.get('/api/notifications/summary', async (request) => {
    const userId = await request.requireAuth();
    const summary = await getNotificationSummary(userId);
    return summary;
  });

  app.post('/api/notifications/read-all', async (request, reply) => {
    const userId = await request.requireAuth();
    await markAllNotificationsRead(userId);
    reply.status(204);
    return null;
  });

  app.post<{ Params: { roomId: string } }>('/api/rooms/:roomId/notifications/read', async (request, reply) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    await requireMembership(roomId, userId);
    await markRoomNotificationsRead(roomId, userId);
    reply.status(204);
    return null;
  });
}
