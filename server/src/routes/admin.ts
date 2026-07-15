import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { HttpError } from '../util/httpError.js';
import { requireAdmin } from '../services/adminAccess.js';
import type { AdminIntegrationStatus, AdminRoomSummary, AdminUserSummary } from '@squadqueue/shared';

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/api/admin/overview', async (request) => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);

    const status: AdminIntegrationStatus = {
      ggDealsApiKeyConfigured: !!env.GGDEALS_API_KEY,
      igdbConfigured: !!env.IGDB_CLIENT_ID && !!env.IGDB_CLIENT_SECRET,
      devFakeAuth: env.DEV_FAKE_AUTH,
      activeAuthProviders: Array.from(app.authProviders.keys()),
    };
    return { status };
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
    await requireAdmin(actorId);
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
    await requireAdmin(actorId);
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
    reply.status(204);
    return null;
  });
}
