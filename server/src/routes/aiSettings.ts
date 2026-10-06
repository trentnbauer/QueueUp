import type { FastifyInstance } from 'fastify';
import type { AdminAiResponse, AiSettingsResponse, AiTestResponse, RoomAiResponse, SetAdminAiRequest, SetUserAiSettingsRequest, UserAiSettings } from '@queueup/shared';
import { logAdminAction } from '../services/adminAuditLog.js';
import { describeAdminAi, saveAdminAi } from '../services/ai/adminAi.js';
import { requireAdmin } from '../services/adminAccess.js';
import { aiComplete, aiCompleteEntry, aiCompleteWithServer, clearUserAiSettings, describeAiSettings, saveUserAiSettings } from '../services/ai/aiConfig.js';
import { applyMyAiToRoom, describeRoomAi, removeRoomAi } from '../services/ai/roomAi.js';
import { requireMembership } from '../services/roomAccess.js';
import type { AiRequest } from '../services/ai/providers.js';

/** A tiny prompt that proves the settings work end to end without spending real tokens. */
const TEST_REQUEST: AiRequest = {
  system: 'You are a connectivity check. Reply with the single word OK.',
  messages: [{ role: 'user', content: 'Reply with OK.' }],
  maxTokens: 16,
  temperature: 0,
};

/** The AI backend's settings: a person's own provider and key, and a way to check them. The key is
 * write-only - no route here ever returns it. Nothing in this file uses the model for anything
 * else; features call `aiComplete` (services/ai/aiConfig.ts) themselves. */
export default async function aiSettingsRoutes(app: FastifyInstance) {
  app.get('/api/me/ai', async (request): Promise<AiSettingsResponse> => {
    const userId = await request.requireAuth();
    return describeAiSettings(userId);
  });

  app.put<{ Body: SetUserAiSettingsRequest }>(
    '/api/me/ai',
    // Writes credential material - tight on top of the global limit, like the admin integrations routes.
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request): Promise<{ user: UserAiSettings }> => {
      const userId = await request.requireAuth();
      return { user: await saveUserAiSettings(userId, request.body) };
    },
  );

  app.delete('/api/me/ai', async (request, reply) => {
    const userId = await request.requireAuth();
    await clearUserAiSettings(userId);
    reply.status(204);
    return null;
  });

  // Each call is a live, billable request to the provider.
  // With `index`, only that saved provider is tried (no falling through to the others).
  app.post<{ Body: { index?: number } | undefined }>('/api/me/ai/test', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request): Promise<AiTestResponse> => {
    const userId = await request.requireAuth();
    const index = request.body?.index;
    if (index !== undefined) {
      const one = await aiCompleteEntry({ userId }, index, TEST_REQUEST);
      return { ok: true, source: 'user', provider: one.provider, model: one.model, reply: one.text.trim().slice(0, 200), fallback: null };
    }
    const res = await aiComplete(TEST_REQUEST, { userId });
    return { ok: true, source: res.source, provider: res.provider, model: res.model, reply: res.text.trim().slice(0, 200), fallback: res.fallback };
  });

  // Applying your own AI settings to a room you're in (see services/ai/roomAi.ts). The key itself is
  // never involved: the room just records who is providing it.
  const isElevated = (role: string) => role === 'room_master' || role === 'moderator';

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/ai', async (request): Promise<RoomAiResponse> => {
    const userId = await request.requireAuth();
    const membership = await requireMembership(request.params.roomId, userId);
    return describeRoomAi(request.params.roomId, userId, isElevated(membership.role));
  });

  app.put<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/ai',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request): Promise<RoomAiResponse> => {
      const userId = await request.requireAuth();
      const membership = await requireMembership(request.params.roomId, userId);
      const elevated = isElevated(membership.role);
      await applyMyAiToRoom(request.params.roomId, userId, elevated);
      return describeRoomAi(request.params.roomId, userId, elevated);
    },
  );

  app.delete<{ Params: { roomId: string } }>('/api/rooms/:roomId/ai', async (request): Promise<RoomAiResponse> => {
    const userId = await request.requireAuth();
    const membership = await requireMembership(request.params.roomId, userId);
    const elevated = isElevated(membership.role);
    await removeRoomAi(request.params.roomId, userId, elevated);
    return describeRoomAi(request.params.roomId, userId, elevated);
  });

  // The Administrator's check of the server-wide settings, regardless of any personal ones.
  app.post<{ Body: { index?: number } | undefined }>('/api/admin/ai/test', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request): Promise<AiTestResponse> => {
    const actorId = await request.requireAuth();
    await requireAdmin(actorId);
    const index = request.body?.index;
    if (index !== undefined) {
      const one = await aiCompleteEntry('server', index, TEST_REQUEST);
      return { ok: true, source: 'server', provider: one.provider, model: one.model, reply: one.text.trim().slice(0, 200), fallback: null };
    }
    const res = await aiCompleteWithServer(TEST_REQUEST);
    return { ok: true, source: 'server', provider: res.provider, model: res.model, reply: res.text.trim().slice(0, 200), fallback: res.fallback };
  });

  // The server-wide first provider and its backups. Keys are write-only here too.
  app.get('/api/admin/ai', async (request): Promise<AdminAiResponse> => {
    const actorId = await request.requireAuth();
    await requireAdmin(actorId);
    return describeAdminAi();
  });

  app.put<{ Body: SetAdminAiRequest }>(
    '/api/admin/ai',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request): Promise<AdminAiResponse> => {
      const actorId = await request.requireAuth();
      const actor = await requireAdmin(actorId);
      const res = await saveAdminAi(actorId, request.body ?? ({} as SetAdminAiRequest));
      app.log.warn({ adminAction: 'ai.set', actorId }, `Admin ${actorId} changed the server AI settings`);
      await logAdminAction({ actorId, actorLabel: actor.email, action: 'ai.set', targetLabel: 'AI providers' });
      return res;
    },
  );
}
