import type { FastifyInstance } from 'fastify';
import type { GenerateYearStoryRequest, UpdateYearStoryRequest, YearStoryDto } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership } from '../services/roomAccess.js';
import { generateStoryText, sanitizeFacts } from '../services/ai/aiYearStory.js';
import { roomScope, saveGeneratedStory, toStoryDto, updateStory, userScope } from '../services/yearStory.js';

const isElevated = (role: string) => role === 'room_master' || role === 'moderator';

/** The AI Year in Review story (issue #826), for a person and for a room. The AI only gets computed
 * numbers and titles. The person can regenerate, edit, hide and (personal only) share it on their
 * profile; a room's story is shown to its members. */
export default async function yearStoryRoutes(app: FastifyInstance) {
  // ---- Personal ----
  app.get('/api/me/year-story', async (request): Promise<{ story: YearStoryDto | null }> => {
    const userId = await request.requireAuth();
    const row = await prisma.yearStory.findUnique({ where: { scopeKey: userScope(userId) } });
    return { story: row ? toStoryDto(row, true) : null };
  });

  // One paid AI call, so a tight limit.
  app.post<{ Body: GenerateYearStoryRequest }>('/api/me/year-story/generate', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request): Promise<{ story: YearStoryDto }> => {
    const userId = await request.requireAuth();
    const { text } = await generateStoryText(userId, undefined, sanitizeFacts(request.body?.facts), 'personal');
    return { story: toStoryDto(await saveGeneratedStory(userScope(userId), { userId }, text), true) };
  });

  app.put<{ Body: UpdateYearStoryRequest }>('/api/me/year-story', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request): Promise<{ story: YearStoryDto }> => {
    const userId = await request.requireAuth();
    return { story: toStoryDto(await updateStory(userScope(userId), request.body, true), true) };
  });

  app.delete('/api/me/year-story', async (request, reply) => {
    const userId = await request.requireAuth();
    await prisma.yearStory.deleteMany({ where: { scopeKey: userScope(userId) } });
    reply.status(204);
  });

  // ---- Room ----
  /** Who may change a room's story: the Room Master, a Moderator, or the member who generated it. */
  async function canManageRoomStory(roomId: string, userId: string, role: string): Promise<boolean> {
    if (isElevated(role)) return true;
    const row = await prisma.yearStory.findUnique({ where: { scopeKey: roomScope(roomId) }, select: { userId: true } });
    return row?.userId === userId;
  }

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/year-story', async (request): Promise<{ story: YearStoryDto | null }> => {
    const userId = await request.requireAuth();
    const membership = await requireMembership(request.params.roomId, userId);
    const row = await prisma.yearStory.findUnique({ where: { scopeKey: roomScope(request.params.roomId) } });
    if (!row) return { story: null };
    const canManage = await canManageRoomStory(request.params.roomId, userId, membership.role);
    // A hidden story is only shown to those who can manage it (so they can unhide it).
    return { story: row.hidden && !canManage ? null : toStoryDto(row, canManage) };
  });

  app.post<{ Params: { roomId: string }; Body: GenerateYearStoryRequest }>(
    '/api/rooms/:roomId/year-story/generate',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request): Promise<{ story: YearStoryDto }> => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      const membership = await requireMembership(roomId, userId);
      const existing = await prisma.yearStory.findUnique({ where: { scopeKey: roomScope(roomId) }, select: { userId: true } });
      // Anyone in the room can write the first one; replacing it is for who can manage it.
      if (existing && !(await canManageRoomStory(roomId, userId, membership.role))) {
        throw new HttpError(403, 'Only the Room Master, a Moderator, or whoever wrote this recap can write a new one.');
      }
      const { text } = await generateStoryText(userId, roomId, sanitizeFacts(request.body?.facts), 'room');
      return { story: toStoryDto(await saveGeneratedStory(roomScope(roomId), { userId, roomId }, text), true) };
    },
  );

  app.put<{ Params: { roomId: string }; Body: UpdateYearStoryRequest }>(
    '/api/rooms/:roomId/year-story',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request): Promise<{ story: YearStoryDto }> => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      const membership = await requireMembership(roomId, userId);
      if (!(await canManageRoomStory(roomId, userId, membership.role))) throw new HttpError(403, 'Only the Room Master, a Moderator, or whoever wrote this recap can change it.');
      return { story: toStoryDto(await updateStory(roomScope(roomId), request.body, false), true) };
    },
  );

  app.delete<{ Params: { roomId: string } }>('/api/rooms/:roomId/year-story', async (request, reply) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    const membership = await requireMembership(roomId, userId);
    if (!(await canManageRoomStory(roomId, userId, membership.role))) throw new HttpError(403, 'Only the Room Master, a Moderator, or whoever wrote this recap can delete it.');
    await prisma.yearStory.deleteMany({ where: { scopeKey: roomScope(roomId) } });
    reply.status(204);
  });
}
