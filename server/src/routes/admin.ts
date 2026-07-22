import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { HttpError } from '../util/httpError.js';
import { requireAdmin } from '../services/adminAccess.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import { getRecentLogLines } from '../services/logBuffer.js';
import {
  CONFIG_KEYS,
  isConfigKey,
  getConfigSource,
  setConfigValue,
  clearConfigValue,
  type ConfigKey,
} from '../services/configResolver.js';
import type { AdminIntegrationStatus, AdminRoomSummary, AdminUserSummary, AdminAuditLogEntry } from '@queueup/shared';

// Human-readable labels for audit log entries / error messages - keyed by the same ConfigKey used
// server-side and sent from the client, so a typo'd key surfaces a clear "unknown setting" error.
const CONFIG_KEY_LABELS: Record<ConfigKey, string> = {
  GGDEALS_API_KEY: 'gg.deals API key',
  IGDB_CLIENT_ID: 'IGDB Client ID',
  IGDB_CLIENT_SECRET: 'IGDB Client Secret',
};

function envValueFor(key: ConfigKey): string | undefined {
  switch (key) {
    case 'GGDEALS_API_KEY':
      return env.GGDEALS_API_KEY;
    case 'IGDB_CLIENT_ID':
      return env.IGDB_CLIENT_ID;
    case 'IGDB_CLIENT_SECRET':
      return env.IGDB_CLIENT_SECRET;
  }
}

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/overview', async (request) => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);

    const [ggDealsApiKeySource, igdbClientIdSource, igdbClientSecretSource] = await Promise.all(
      CONFIG_KEYS.map((key) => getConfigSource(key, envValueFor(key))),
    );

    const status: AdminIntegrationStatus = {
      ggDealsApiKeyConfigured: ggDealsApiKeySource !== 'unset',
      ggDealsApiKeySource,
      igdbConfigured: igdbClientIdSource !== 'unset' && igdbClientSecretSource !== 'unset',
      igdbClientIdSource,
      igdbClientSecretSource,
      devFakeAuth: env.DEV_FAKE_AUTH,
      activeAuthProviders: Array.from(app.authProviders.keys()),
    };
    return { status };
  });

  // Explicit per-route limit (on top of the global one in app.ts) since these write credential
  // material - tighter than the global 200/min default, mirroring auth.ts's login-route pattern.
  const integrationsWriteRateLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.patch<{ Body: { key: string; value: string } }>(
    '/api/admin/integrations',
    integrationsWriteRateLimit,
    async (request) => {
      const actorId = await request.requireAuth();
      const actor = await requireAdmin(actorId);
      const { key, value } = request.body ?? {};

      if (typeof key !== 'string' || !isConfigKey(key)) {
        throw new HttpError(400, `Unknown integration setting: ${key}`);
      }
      if (envValueFor(key)) {
        throw new HttpError(
          400,
          `${CONFIG_KEY_LABELS[key]} is set via .env, which always takes precedence — unset it there first if you want to manage it here instead.`,
        );
      }
      if (typeof value !== 'string' || !value.trim()) {
        throw new HttpError(400, 'A non-empty value is required');
      }

      await setConfigValue(key, value.trim(), actorId);
      app.log.warn({ adminAction: 'integration.set', actorId, key }, `Admin ${actorId} set integration config ${key}`);
      await logAdminAction({
        actorId,
        actorLabel: actor.email,
        action: 'integration.set',
        targetLabel: CONFIG_KEY_LABELS[key],
      });
      return { ok: true };
    },
  );

  app.delete<{ Params: { key: string } }>(
    '/api/admin/integrations/:key',
    integrationsWriteRateLimit,
    async (request, reply) => {
      const actorId = await request.requireAuth();
      const actor = await requireAdmin(actorId);
      const { key } = request.params;

      if (!isConfigKey(key)) {
        throw new HttpError(400, `Unknown integration setting: ${key}`);
      }

      await clearConfigValue(key);
      app.log.warn(
        { adminAction: 'integration.clear', actorId, key },
        `Admin ${actorId} cleared integration config ${key}`,
      );
      await logAdminAction({
        actorId,
        actorLabel: actor.email,
        action: 'integration.clear',
        targetLabel: CONFIG_KEY_LABELS[key],
      });
      reply.status(204);
      return null;
    },
  );

  app.get('/api/admin/users', async (request) => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);

    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    const summaries: AdminUserSummary[] = users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      avatarColor: u.avatarColor,
      avatarUrl: u.avatarUrl,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt.toISOString(),
    }));
    return { users: summaries };
  });

  // Explicit per-route limit (on top of the global one in app.ts), same reasoning as
  // integrationsWriteRateLimit above - these aren't things a normal admin session comes close to
  // doing at volume, so a tight limit costs nothing legitimate while blunting abuse of a
  // compromised admin session/token.
  const sensitiveAdminActionRateLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.patch<{ Params: { id: string }; Body: { isAdmin: boolean } }>(
    '/api/admin/users/:id/admin',
    sensitiveAdminActionRateLimit,
    async (request) => {
      const actorId = await request.requireAuth();
      const actor = await requireAdmin(actorId);
      const { id: targetId } = request.params;
      const { isAdmin } = request.body ?? {};

      if (typeof isAdmin !== 'boolean') {
        throw new HttpError(400, 'isAdmin must be a boolean');
      }
      if (targetId === actorId) {
        throw new HttpError(400, 'You cannot change your own administrator status');
      }

      const target = await prisma.user.findUnique({ where: { id: targetId } });
      if (!target) {
        throw new HttpError(404, 'User not found');
      }

      const updated = await prisma.user.update({ where: { id: targetId }, data: { isAdmin } });
      app.log.warn(
        { adminAction: isAdmin ? 'user.promote' : 'user.demote', actorId, targetId, targetEmail: target.email },
        `Admin ${actorId} ${isAdmin ? 'promoted' : 'demoted'} user ${targetId} (${target.email})`,
      );
      await logAdminAction({
        actorId,
        actorLabel: actor.email,
        action: isAdmin ? 'user.promote' : 'user.demote',
        targetLabel: target.email,
        metadata: { targetId },
      });

      const summary: AdminUserSummary = {
        id: updated.id,
        displayName: updated.displayName,
        email: updated.email,
        avatarColor: updated.avatarColor,
        avatarUrl: updated.avatarUrl,
        isAdmin: updated.isAdmin,
        createdAt: updated.createdAt.toISOString(),
      };
      return { user: summary };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/admin/users/:id', async (request, reply) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const { id: targetId } = request.params;

    if (targetId === actorId) {
      throw new HttpError(400, 'You cannot delete your own account');
    }

    const createdRoomCount = await prisma.room.count({ where: { createdBy: targetId } });
    if (createdRoomCount > 0) {
      throw new HttpError(
        400,
        `This user created ${createdRoomCount} room(s) — delete those rooms first before deleting the user.`,
      );
    }

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new HttpError(404, 'User not found');
    }
    try {
      await prisma.user.delete({ where: { id: targetId } });
    } catch (err) {
      // Still possible even after the findUnique check above (another admin's delete, or a
      // retried request, landing in the gap between the two) - Prisma's P2025 has no statusCode
      // of its own, so without this it'd fall through to the global handler's 500 default.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new HttpError(404, 'User not found');
      }
      throw err;
    }
    app.log.warn(
      { adminAction: 'user.delete', actorId, targetId, targetEmail: target.email },
      `Admin ${actorId} deleted user ${targetId} (${target.email})`,
    );
    await logAdminAction({
      actorId,
      actorLabel: actor.email,
      action: 'user.delete',
      targetLabel: target.email,
      metadata: { targetId },
    });
    reply.status(204);
    return null;
  });

  app.get('/api/admin/rooms', async (request) => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);

    const rooms = await prisma.room.findMany({
      include: { creator: true, _count: { select: { members: true, games: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const summaries: AdminRoomSummary[] = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      createdBy: r.createdBy,
      creatorDisplayName: r.creator.displayName,
      memberCount: r._count.members,
      gameCount: r._count.games,
      createdAt: r.createdAt.toISOString(),
    }));
    return { rooms: summaries };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/rooms/:id', async (request, reply) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const { id: targetId } = request.params;

    const target = await prisma.room.findUnique({
      where: { id: targetId },
      include: { _count: { select: { members: true, games: true } } },
    });
    if (!target) {
      throw new HttpError(404, 'Room not found');
    }
    try {
      await prisma.room.delete({ where: { id: targetId } });
    } catch (err) {
      // Same TOCTOU gap as the user-delete route above.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new HttpError(404, 'Room not found');
      }
      throw err;
    }
    app.log.warn(
      {
        adminAction: 'room.delete',
        actorId,
        targetId,
        targetName: target.name,
        memberCount: target._count.members,
        gameCount: target._count.games,
      },
      `Admin ${actorId} deleted room ${targetId} (${target.name}), cascading ${target._count.members} member(s) and ${target._count.games} game(s)`,
    );
    await logAdminAction({
      actorId,
      actorLabel: actor.email,
      action: 'room.delete',
      targetLabel: target.name,
      metadata: { targetId, memberCount: target._count.members, gameCount: target._count.games },
    });
    reply.status(204);
    return null;
  });

  const ARCHIVE_DONE_AFTER_DAYS = 90;

  app.post('/api/admin/games/archive-done', async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);

    const cutoff = new Date(Date.now() - ARCHIVE_DONE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await prisma.game.updateMany({
      where: { status: 'done', archivedAt: null, updatedAt: { lt: cutoff } },
      data: { archivedAt: new Date() },
    });
    app.log.warn(
      { adminAction: 'games.archiveDone', actorId, count, cutoff: cutoff.toISOString() },
      `Admin ${actorId} archived ${count} Done game(s) untouched since before ${cutoff.toISOString()}`,
    );
    await logAdminAction({
      actorId,
      actorLabel: actor.email,
      action: 'games.archiveDone',
      targetLabel: `${count} game(s)`,
      metadata: { count, cutoff: cutoff.toISOString() },
    });
    return { archivedCount: count };
  });

  app.get<{ Querystring: { limit?: string } }>('/api/admin/audit-log', async (request) => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);

    const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 500);
    const entries = await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const dtos: AdminAuditLogEntry[] = entries.map((e) => ({
      id: e.id,
      actorLabel: e.actorLabel,
      action: e.action,
      targetLabel: e.targetLabel,
      metadata: (e.metadata as Record<string, unknown> | null) ?? null,
      createdAt: e.createdAt.toISOString(),
    }));
    return { entries: dtos };
  });

  // Exports the server's own recent application logs (issue #192) - not the Docker daemon's logs,
  // which would need the Docker socket mounted into the container (a meaningfully bigger attack
  // surface for a self-hosted app than this endpoint being admin-gated). Good enough for the
  // common case: seeing recent request/error activity without shelling into the host.
  app.get('/api/admin/logs/export', sensitiveAdminActionRateLimit, async (request, reply) => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);

    const header = [
      'QueueUp troubleshooting log export',
      `Generated: ${new Date().toISOString()}`,
      `App version: ${process.env.APP_VERSION ?? 'dev'} (sha ${process.env.APP_SHA ?? 'unknown'})`,
      `NODE_ENV: ${process.env.NODE_ENV ?? 'unset'}`,
      '',
    ].join('\n');
    const body = header + getRecentLogLines().join('');

    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="queueup-logs-${Date.now()}.txt"`);
    return body;
  });
}
