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
import { sendMail, smtpIsConfigured } from '../services/mailer.js';
import { getTunnelStatus, reloadTunnel } from '../services/cloudflareTunnel.js';
import type { ConfigSource, AdminIntegrationStatus, AdminRoomDetail, AdminRoomSummary, AdminUserSummary, AdminAuditLogEntry, SpinWheelTheme } from '@queueup/shared';
import { SPIN_WHEEL_THEMES } from '@queueup/shared';
import { redis } from '../services/redisClient.js';
import { ADMIN_MANAGE_TTL_SECONDS, adminManageKey, adminManagedRoomIds } from '../services/roomAccess.js';
import { logRoomActivity } from '../services/roomActivity.js';

/** When the administrator's "Manage as Room Master" for the room runs out, or null if it's off. */
async function managingUntil(userId: string, roomId: string): Promise<string | null> {
  const ttl = await redis.ttl(adminManageKey(userId, roomId));
  return ttl > 0 ? new Date(Date.now() + ttl * 1000).toISOString() : null;
}

// Human-readable labels for audit log entries / error messages - keyed by the same ConfigKey used
// server-side and sent from the client, so a typo'd key surfaces a clear "unknown setting" error.
const CONFIG_KEY_LABELS: Record<ConfigKey, string> = {
  GGDEALS_API_KEY: 'gg.deals API key',
  IGDB_CLIENT_ID: 'IGDB Client ID',
  IGDB_CLIENT_SECRET: 'IGDB Client Secret',
  SCANDEX_API_KEY: 'ScanDex API key',
  TURNSTILE_SITE_KEY: 'Turnstile site key',
  TURNSTILE_SECRET_KEY: 'Turnstile secret key',
  GA_MEASUREMENT_ID: 'Google Analytics measurement ID',
  CLOUDFLARE_TUNNEL_TOKEN: 'Cloudflare Tunnel token',
  SMTP_HOST: 'SMTP host',
  SMTP_PORT: 'SMTP port',
  SMTP_USER: 'SMTP user',
  SMTP_PASSWORD: 'SMTP password',
  SMTP_FROM: 'SMTP from address',
};

function envValueFor(key: ConfigKey): string | undefined {
  switch (key) {
    case 'GGDEALS_API_KEY':
      return env.GGDEALS_API_KEY;
    case 'IGDB_CLIENT_ID':
      return env.IGDB_CLIENT_ID;
    case 'IGDB_CLIENT_SECRET':
      return env.IGDB_CLIENT_SECRET;
    case 'SCANDEX_API_KEY':
      return env.SCANDEX_API_KEY;
    case 'TURNSTILE_SITE_KEY':
      return env.TURNSTILE_SITE_KEY;
    case 'TURNSTILE_SECRET_KEY':
      return env.TURNSTILE_SECRET_KEY;
    case 'GA_MEASUREMENT_ID':
      return env.GA_MEASUREMENT_ID;
    case 'CLOUDFLARE_TUNNEL_TOKEN':
      return env.CLOUDFLARE_TUNNEL_TOKEN;
    case 'SMTP_HOST':
      return env.SMTP_HOST;
    case 'SMTP_PORT':
      return env.SMTP_PORT;
    case 'SMTP_USER':
      return env.SMTP_USER;
    case 'SMTP_PASSWORD':
      return env.SMTP_PASSWORD;
    case 'SMTP_FROM':
      return env.SMTP_FROM;
  }
}

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/overview', async (request) => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);

    const sources = new Map<ConfigKey, ConfigSource>(
      await Promise.all(CONFIG_KEYS.map(async (key) => [key, await getConfigSource(key, envValueFor(key))] as const)),
    );
    const src = (key: ConfigKey): ConfigSource => sources.get(key) ?? 'unset';
    const ggDealsApiKeySource = src('GGDEALS_API_KEY');
    const igdbClientIdSource = src('IGDB_CLIENT_ID');
    const igdbClientSecretSource = src('IGDB_CLIENT_SECRET');
    const scandexApiKeySource = src('SCANDEX_API_KEY');
    const turnstileSiteKeySource = src('TURNSTILE_SITE_KEY');
    const turnstileSecretKeySource = src('TURNSTILE_SECRET_KEY');

    const status: AdminIntegrationStatus = {
      ggDealsApiKeyConfigured: ggDealsApiKeySource !== 'unset',
      ggDealsApiKeySource,
      igdbConfigured: igdbClientIdSource !== 'unset' && igdbClientSecretSource !== 'unset',
      igdbClientIdSource,
      igdbClientSecretSource,
      scandexApiKeyConfigured: scandexApiKeySource !== 'unset',
      scandexApiKeySource,
      turnstileConfigured: turnstileSiteKeySource !== 'unset' && turnstileSecretKeySource !== 'unset',
      turnstileSiteKeySource,
      turnstileSecretKeySource,
      gaMeasurementIdSource: src('GA_MEASUREMENT_ID'),
      smtpConfigured: src('SMTP_HOST') !== 'unset' && src('SMTP_PORT') !== 'unset' && src('SMTP_FROM') !== 'unset',
      smtpSources: {
        SMTP_HOST: src('SMTP_HOST'),
        SMTP_PORT: src('SMTP_PORT'),
        SMTP_USER: src('SMTP_USER'),
        SMTP_PASSWORD: src('SMTP_PASSWORD'),
        SMTP_FROM: src('SMTP_FROM'),
      },
      devFakeAuth: env.DEV_FAKE_AUTH,
      activeAuthProviders: Array.from(app.authProviders.keys()),
    };
    return { status, tunnel: await getTunnelStatus() };
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
      // A new tunnel token takes effect straight away, no container restart.
      if (key === 'CLOUDFLARE_TUNNEL_TOKEN') await reloadTunnel();
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
      if (key === 'CLOUDFLARE_TUNNEL_TOKEN') await reloadTunnel();
      reply.status(204);
      return null;
    },
  );

  // Sends a test message to the admin's own address so they can check the SMTP settings work.
  app.post(
    '/api/admin/smtp/test',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const actorId = await request.requireAuth();
      const actor = await requireAdmin(actorId);
      if (!(await smtpIsConfigured())) throw new HttpError(400, 'Set the SMTP host, port and from address first');
      try {
        await sendMail({
          to: actor.email,
          subject: 'QueueUp test email',
          text: 'If you can read this, QueueUp can send email alerts.',
        });
      } catch (err) {
        throw new HttpError(502, `Could not send the test email: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
      return { ok: true, sentTo: actor.email };
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
    const managed = new Set(await adminManagedRoomIds(userId));
    const until = await Promise.all(rooms.map((r) => (managed.has(r.id) ? managingUntil(userId, r.id) : null)));
    const summaries: AdminRoomSummary[] = rooms.map((r, i) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      createdBy: r.createdBy,
      creatorDisplayName: r.creator.displayName,
      memberCount: r._count.members,
      gameCount: r._count.games,
      createdAt: r.createdAt.toISOString(),
      managingUntil: until[i],
    }));
    return { rooms: summaries };
  });

  // #792: a read-only look at any room - its settings, members and games - without joining it.
  app.get<{ Params: { id: string } }>('/api/admin/rooms/:id', async (request) => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);
    const r = await prisma.room.findUnique({
      where: { id: request.params.id },
      include: {
        creator: true,
        members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
        games: { where: { archivedAt: null }, include: { votes: { select: { value: true } }, adder: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' } },
        _count: { select: { members: true, games: true } },
      },
    });
    if (!r) throw new HttpError(404, 'Room not found');
    const detail: AdminRoomDetail = {
      room: {
        id: r.id,
        name: r.name,
        platform: r.platform,
        createdBy: r.createdBy,
        creatorDisplayName: r.creator.displayName,
        memberCount: r._count.members,
        gameCount: r._count.games,
        createdAt: r.createdAt.toISOString(),
        managingUntil: await managingUntil(userId, r.id),
        isPublic: r.isPublic,
        requireGameApproval: r.requireGameApproval,
        invitePermission: r.invitePermission,
        spinOwnershipMaxPrice: r.spinOwnershipMaxPrice,
        spinWheelTheme: (SPIN_WHEEL_THEMES as string[]).includes(r.spinWheelTheme) ? (r.spinWheelTheme as SpinWheelTheme) : 'reel',
      },
      members: r.members.map((m) => ({
        user: { id: m.user.id, displayName: m.user.displayName, avatarColor: m.user.avatarColor, avatarUrl: m.user.avatarUrl, isAdmin: m.user.isAdmin },
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
      games: r.games.map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        voteScore: g.votes.reduce((sum, v) => sum + v.value, 0),
        coverImageUrl: g.coverImageUrl,
        addedByName: g.adder.displayName,
      })),
    };
    return detail;
  });

  // #792: "Manage as Room Master" - for the next hour the administrator can change anything in the
  // room as if they owned it (see requireMembership), without joining it or replacing its actual
  // Room Master. Audited, and posted to the room's activity feed so its members can see it.
  app.post<{ Params: { id: string } }>('/api/admin/rooms/:id/manage', sensitiveAdminActionRateLimit, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const room = await prisma.room.findUnique({ where: { id: request.params.id }, select: { id: true, name: true } });
    if (!room) throw new HttpError(404, 'Room not found');
    await redis.set(adminManageKey(actorId, room.id), '1', 'EX', ADMIN_MANAGE_TTL_SECONDS);
    app.log.warn({ adminAction: 'room.manage', actorId, targetId: room.id }, `Admin ${actorId} is managing room ${room.id} (${room.name})`);
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'room.manage', targetLabel: room.name, metadata: { targetId: room.id } });
    void logRoomActivity({
      roomId: room.id,
      actorId,
      type: 'admin_manage',
      message: (actorName) => `${actorName} (server administrator) is managing this room`,
    });
    return { managingUntil: await managingUntil(actorId, room.id) };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/rooms/:id/manage', async (request, reply) => {
    const actorId = await request.requireAuth();
    await requireAdmin(actorId);
    await redis.del(adminManageKey(actorId, request.params.id));
    reply.status(204);
    return null;
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
