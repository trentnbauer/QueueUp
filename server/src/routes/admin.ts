import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { HttpError } from '../util/httpError.js';
import { requireAdmin } from '../services/adminAccess.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import {
  CONFIG_KEYS,
  isConfigKey,
  getConfigSource,
  setConfigValue,
  clearConfigValue,
  type ConfigKey,
} from '../services/configResolver.js';
import type { AdminIntegrationStatus, AdminRoomSummary, AdminUserSummary, AdminAuditLogEntry } from '@squadqueue/shared';

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

  app.patch<{ Body: { key: string; value: string } }>('/api/admin/integrations', async (request) => {
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
  });

  app.delete<{ Params: { key: string } }>('/api/admin/integrations/:key', async (request, reply) => {
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
  });

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
    await prisma.user.delete({ where: { id: targetId } });
    app.log.warn(
      { adminAction: 'user.delete', actorId, targetId, targetEmail: target?.email },
      `Admin ${actorId} deleted user ${targetId} (${target?.email ?? 'unknown'})`,
    );
    await logAdminAction({
      actorId,
      actorLabel: actor.email,
      action: 'user.delete',
      targetLabel: target?.email ?? targetId,
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
    await prisma.room.delete({ where: { id: targetId } });
    app.log.warn(
      {
        adminAction: 'room.delete',
        actorId,
        targetId,
        targetName: target?.name,
        memberCount: target?._count.members,
        gameCount: target?._count.games,
      },
      `Admin ${actorId} deleted room ${targetId} (${target?.name ?? 'unknown'}), cascading ${target?._count.members ?? 0} member(s) and ${target?._count.games ?? 0} game(s)`,
    );
    await logAdminAction({
      actorId,
      actorLabel: actor.email,
      action: 'room.delete',
      targetLabel: target?.name ?? targetId,
      metadata: { targetId, memberCount: target?._count.members ?? null, gameCount: target?._count.games ?? null },
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
}
