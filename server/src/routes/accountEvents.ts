import type { FastifyInstance } from 'fastify';
import { getAccountEvents } from '../services/accountEvents.js';

export default async function accountEventRoutes(app: FastifyInstance) {
  // The caller's own history only (Settings -> Account history).
  app.get<{ Querystring: { before?: string } }>(
    '/api/me/events',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      return getAccountEvents(userId, request.query.before);
    },
  );
}
