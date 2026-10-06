import type { FastifyInstance } from 'fastify';
import type { AdminAiResponse, AiActivityResponse, AiBenchmarkResult, AiModelsRequest, AiModelsResponse, AiSettingsResponse, AiTestResponse, RoomAiResponse, SetAdminAiRequest, SetUserAiSettingsRequest, UserAiSettings } from '@queueup/shared';
import { HttpError } from '../util/httpError.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import { describeAdminAi, saveAdminAi } from '../services/ai/adminAi.js';
import { requireAdmin } from '../services/adminAccess.js';
import { unlockFeatureBadges } from '../services/badges.js';
import { aiComplete, aiCompleteEntry, aiCompleteWithServer, clearUserAiSettings, describeAiSettings, saveUserAiSettings } from '../services/ai/aiConfig.js';
import { isBenchmarkStep, runBenchmarkStep } from '../services/ai/aiBenchmark.js';
import { aiActivityFor } from '../services/ai/aiJobs.js';
import { listModelsFor } from '../services/ai/aiModels.js';
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
      const saved = await saveUserAiSettings(userId, request.body);
      void unlockFeatureBadges(userId);
      return { user: saved };
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

  // What the AI is doing for this person right now (running or waiting its turn), for the notifications.
  app.get('/api/me/ai/activity', async (request): Promise<AiActivityResponse> => {
    const userId = await request.requireAuth();
    return { activity: aiActivityFor(userId) };
  });

  // The models a provider offers, for the dropdown next to the model field. A live request to
  // whatever address is given, so a tight limit (and the same address rules as a real AI call).
  app.post<{ Body: AiModelsRequest }>('/api/me/ai/models', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request): Promise<AiModelsResponse> => {
    const userId = await request.requireAuth();
    return listModelsFor({ userId }, request.body);
  });

  // Benchmark one saved provider, one timed step per call (see services/ai/aiBenchmark.ts). Billable
  // like the test, and slow ones can take up to the AI request timeout, so a tight limit.
  app.post<{ Body: { index?: unknown; step?: unknown } | undefined }>(
    '/api/me/ai/benchmark',
    { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (request): Promise<AiBenchmarkResult> => {
      const userId = await request.requireAuth();
      const { index, step } = request.body ?? {};
      if (typeof index !== 'number' || !isBenchmarkStep(step)) throw new HttpError(400, 'index and a valid step are required');
      return runBenchmarkStep({ userId }, index, step);
    },
  );

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

  app.post<{ Body: AiModelsRequest }>('/api/admin/ai/models', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request): Promise<AiModelsResponse> => {
    const actorId = await request.requireAuth();
    await requireAdmin(actorId);
    return listModelsFor('server', request.body);
  });

  app.post<{ Body: { index?: unknown; step?: unknown } | undefined }>(
    '/api/admin/ai/benchmark',
    { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (request): Promise<AiBenchmarkResult> => {
      const actorId = await request.requireAuth();
      await requireAdmin(actorId);
      const { index, step } = request.body ?? {};
      if (typeof index !== 'number' || !isBenchmarkStep(step)) throw new HttpError(400, 'index and a valid step are required');
      return runBenchmarkStep('server', index, step);
    },
  );

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
