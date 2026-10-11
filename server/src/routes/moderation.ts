import type { FastifyInstance } from 'fastify';
import type { AdminUserReport, BlockedUser, ReportUserRequest } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireAdmin } from '../services/adminAccess.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import { blockUser } from '../services/blocks.js';

const MAX_REASON_LENGTH = 1000;

async function requireTarget(userId: unknown, me: string) {
  if (typeof userId !== 'string' || !userId) throw new HttpError(400, 'A user id is required');
  if (userId === me) throw new HttpError(400, "You can't do that to yourself");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true } });
  if (!target) throw new HttpError(404, 'User not found');
  return target;
}

/** Blocking and reporting people. A block hides two people from each other (see services/blocks.ts); a
 * report puts the reporter's own words in front of administrators, and nobody else. */
export default async function moderationRoutes(app: FastifyInstance) {
  app.get('/api/blocks', async (request): Promise<{ blocks: BlockedUser[] }> => {
    const userId = await request.requireAuth();
    const rows = await prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { select: { id: true, displayName: true, avatarColor: true, avatarUrl: true } } },
    });
    return {
      blocks: rows.map((r) => ({
        userId: r.blocked.id,
        displayName: r.blocked.displayName,
        avatarColor: r.blocked.avatarColor,
        avatarUrl: r.blocked.avatarUrl,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  app.post<{ Body: { userId: string } }>('/api/blocks', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request) => {
    const me = await request.requireAuth();
    const target = await requireTarget(request.body?.userId, me);
    await blockUser(me, target.id);
    return { ok: true };
  });

  app.delete<{ Params: { userId: string } }>('/api/blocks/:userId', async (request) => {
    const me = await request.requireAuth();
    await prisma.userBlock.deleteMany({ where: { blockerId: me, blockedId: request.params.userId } });
    return { ok: true };
  });

  app.post<{ Body: ReportUserRequest }>('/api/reports', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request) => {
    const me = await request.requireAuth();
    const target = await requireTarget(request.body?.userId, me);
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
    if (!reason) throw new HttpError(400, 'Tell us why you are reporting them');
    if (reason.length > MAX_REASON_LENGTH) throw new HttpError(400, `Keep the reason under ${MAX_REASON_LENGTH} characters`);
    await prisma.userReport.create({ data: { reporterId: me, reportedUserId: target.id, reason } });
    if (request.body.alsoBlock) await blockUser(me, target.id);
    return { ok: true };
  });

  app.get<{ Querystring: { status?: string } }>('/api/admin/reports', async (request): Promise<{ reports: AdminUserReport[] }> => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);
    const resolved = request.query.status === 'resolved';
    const rows = await prisma.userReport.findMany({
      where: { resolvedAt: resolved ? { not: null } : null },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { reporter: { select: { id: true, displayName: true } }, reported: { select: { id: true, displayName: true } } },
    });
    return {
      reports: rows.map((r) => ({
        id: r.id,
        reporter: r.reporter,
        reported: r.reported,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
    };
  });

  app.post<{ Params: { id: string } }>('/api/admin/reports/:id/resolve', async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const report = await prisma.userReport.findUnique({ where: { id: request.params.id }, include: { reported: { select: { displayName: true } } } });
    if (!report) throw new HttpError(404, 'Report not found');
    if (!report.resolvedAt) {
      await prisma.userReport.update({ where: { id: report.id }, data: { resolvedAt: new Date(), resolvedBy: actorId } });
      await logAdminAction({ actorId, actorLabel: actor.email, action: 'report.resolve', targetLabel: report.reported.displayName, metadata: { reportId: report.id } });
    }
    return { ok: true };
  });
}
