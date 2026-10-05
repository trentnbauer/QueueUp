import type { FastifyInstance } from 'fastify';
import type { RoomWeeklyRecapResponse, UpdateRoomWeeklyRecapRequest } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership } from '../services/roomAccess.js';
import { generateRoomRecap } from '../services/weeklyRecap.js';

const isElevated = (role: string) => role === 'room_master' || role === 'moderator';

/** The AI weekly room recap (issue #830): members read the latest one, the Room Master or a Moderator
 * turns it on or off, chooses whether it also goes to Discord, and can write one now. */
export default async function roomRecapRoutes(app: FastifyInstance) {
  async function describe(roomId: string, canManage: boolean): Promise<RoomWeeklyRecapResponse> {
    const [room, recap] = await Promise.all([
      prisma.room.findUniqueOrThrow({ where: { id: roomId }, select: { weeklyRecapEnabled: true, weeklyRecapDiscord: true, discordWebhookUrl: true } }),
      prisma.roomRecap.findFirst({ where: { roomId }, orderBy: { createdAt: 'desc' }, select: { text: true, windowStart: true, createdAt: true } }),
    ]);
    return {
      enabled: room.weeklyRecapEnabled,
      postToDiscord: room.weeklyRecapDiscord,
      hasDiscordWebhook: !!room.discordWebhookUrl,
      canManage,
      recap: recap ? { text: recap.text, windowStart: recap.windowStart.toISOString(), createdAt: recap.createdAt.toISOString() } : null,
    };
  }

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/weekly-recap', async (request): Promise<RoomWeeklyRecapResponse> => {
    const userId = await request.requireAuth();
    const membership = await requireMembership(request.params.roomId, userId);
    return describe(request.params.roomId, isElevated(membership.role));
  });

  app.put<{ Params: { roomId: string }; Body: UpdateRoomWeeklyRecapRequest }>(
    '/api/rooms/:roomId/weekly-recap',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request): Promise<RoomWeeklyRecapResponse> => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      const membership = await requireMembership(roomId, userId);
      if (!isElevated(membership.role)) throw new HttpError(403, 'Only the Room Master or a Moderator can change the weekly recap.');
      const { enabled, postToDiscord } = request.body ?? {};
      if ((enabled !== undefined && typeof enabled !== 'boolean') || (postToDiscord !== undefined && typeof postToDiscord !== 'boolean')) {
        throw new HttpError(400, 'enabled and postToDiscord must be true or false');
      }
      await prisma.room.update({
        where: { id: roomId },
        data: { ...(enabled !== undefined && { weeklyRecapEnabled: enabled }), ...(postToDiscord !== undefined && { weeklyRecapDiscord: postToDiscord }) },
      });
      return describe(roomId, true);
    },
  );

  // Writes one now (for the last 7 days) instead of waiting for the weekly run. One paid AI call.
  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/weekly-recap/generate',
    { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } },
    async (request): Promise<RoomWeeklyRecapResponse> => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      const membership = await requireMembership(roomId, userId);
      if (!isElevated(membership.role)) throw new HttpError(403, 'Only the Room Master or a Moderator can write a recap now.');
      await generateRoomRecap(roomId);
      return describe(roomId, true);
    },
  );
}
