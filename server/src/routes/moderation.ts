import type { FastifyInstance } from 'fastify';
import { REPORT_REASONS, type AdminBan, type AdminUnbanRequest, type AdminUserReport, type BlockedUser, type ReportReason, type ReportUserRequest } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireAdmin } from '../services/adminAccess.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import { blockUser } from '../services/blocks.js';
import { forgetBan } from '../services/banCache.js';
import { notifyAdmins } from '../services/adminNotifications.js';
import { blockDisplayName, placeholderDisplayName } from '../services/displayNames.js';
import { notifyAccountChange } from '../services/notifications.js';

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
    const rawReasons = request.body?.reasons ?? [];
    if (!Array.isArray(rawReasons) || !rawReasons.every((r) => (REPORT_REASONS as readonly string[]).includes(r))) throw new HttpError(400, 'Unknown report reason');
    const reasons = [...new Set(rawReasons)] as ReportReason[];
    if (!reason && reasons.length === 0) throw new HttpError(400, 'Pick a reason or tell us why you are reporting them');
    if (reason.length > MAX_REASON_LENGTH) throw new HttpError(400, `Keep the reason under ${MAX_REASON_LENGTH} characters`);
    await prisma.userReport.create({ data: { reporterId: me, reportedUserId: target.id, reason, reasons } });
    const reporter = await prisma.user.findUnique({ where: { id: me }, select: { displayName: true } });
    void notifyAdmins('admin_report', `${reporter?.displayName ?? 'Someone'} reported ${target.displayName}. Open Reports on the Administrator page to read why.`);
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
      include: { reporter: { select: { id: true, displayName: true } }, reported: { select: { id: true, displayName: true, bannedAt: true } } },
    });
    return {
      reports: rows.map((r) => ({
        id: r.id,
        reporter: r.reporter,
        reported: { id: r.reported.id, displayName: r.reported.displayName },
        reportedBanned: !!r.reported.bannedAt,
        reasons: r.reasons as ReportReason[],
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


  /** Loads a report and who it is about, for an action an administrator takes on it. */
  async function loadReportForAction(id: string) {
    const report = await prisma.userReport.findUnique({ where: { id }, include: { reported: { select: { id: true, displayName: true, isAdmin: true } } } });
    if (!report) throw new HttpError(404, 'Report not found');
    return report;
  }
  const resolveAfterAction = (report: { id: string; resolvedAt: Date | null }, adminId: string) =>
    report.resolvedAt ? Promise.resolve() : prisma.userReport.update({ where: { id: report.id }, data: { resolvedAt: new Date(), resolvedBy: adminId } });

  // The name is offensive: blacklist it, give the person a neutral stand-in, and make them pick a new
  // one before they can use the app. Resolves the report.
  app.post<{ Params: { id: string } }>('/api/admin/reports/:id/force-name-change', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const report = await loadReportForAction(request.params.id);
    if (report.reported.isAdmin) throw new HttpError(400, 'Remove their administrator role first');
    const oldName = report.reported.displayName;
    await blockDisplayName(oldName, actorId);
    await prisma.user.update({ where: { id: report.reported.id }, data: { displayName: placeholderDisplayName(), mustChangeName: true } });
    await resolveAfterAction(report, actorId);
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'user.force_name_change', targetLabel: oldName, metadata: { userId: report.reported.id, reportId: report.id } });
    await notifyAccountChange(report.reported.id, 'An administrator removed your display name because it broke the rules. Choose a new one.');
    return { ok: true };
  });

  // The avatar is offensive: clear it. Resolves the report.
  app.post<{ Params: { id: string } }>('/api/admin/reports/:id/reset-avatar', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const report = await loadReportForAction(request.params.id);
    if (report.reported.isAdmin) throw new HttpError(400, 'Remove their administrator role first');
    await prisma.user.update({ where: { id: report.reported.id }, data: { avatarUrl: null } });
    await resolveAfterAction(report, actorId);
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'user.reset_avatar', targetLabel: report.reported.displayName, metadata: { userId: report.reported.id, reportId: report.id } });
    await notifyAccountChange(report.reported.id, 'An administrator removed your profile picture because it broke the rules.');
    return { ok: true };
  });

  const MAX_BAN_REASON = 500;

  app.post<{ Params: { id: string }; Body: { reason?: string } }>('/api/admin/users/:id/ban', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const target = await prisma.user.findUnique({ where: { id: request.params.id }, select: { id: true, displayName: true, isAdmin: true, bannedAt: true } });
    if (!target) throw new HttpError(404, 'User not found');
    if (target.id === actorId) throw new HttpError(400, "You can't ban yourself");
    if (target.isAdmin) throw new HttpError(400, 'Remove their administrator role before banning them');
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
    if (reason.length > MAX_BAN_REASON) throw new HttpError(400, `Keep the reason under ${MAX_BAN_REASON} characters`);
    if (!target.bannedAt) {
      await prisma.user.update({ where: { id: target.id }, data: { bannedAt: new Date(), banReason: reason || null } });
      forgetBan(target.id);
      await logAdminAction({ actorId, actorLabel: actor.email, action: 'user.ban', targetLabel: target.displayName, metadata: { userId: target.id, reason: reason || null } });
    }
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/unban', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const target = await prisma.user.findUnique({ where: { id: request.params.id }, select: { id: true, displayName: true, bannedAt: true } });
    if (!target) throw new HttpError(404, 'User not found');
    if (target.bannedAt) {
      await prisma.$transaction([
        prisma.user.update({ where: { id: target.id }, data: { bannedAt: null, banReason: null } }),
        prisma.unbanRequest.updateMany({ where: { userId: target.id, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedBy: actorId } }),
      ]);
      forgetBan(target.id);
      await logAdminAction({ actorId, actorLabel: actor.email, action: 'user.unban', targetLabel: target.displayName, metadata: { userId: target.id } });
    }
    return { ok: true };
  });

  app.get('/api/admin/bans', async (request): Promise<{ bans: AdminBan[]; unbanRequests: AdminUnbanRequest[] }> => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);
    const [users, requests] = await Promise.all([
      prisma.user.findMany({ where: { bannedAt: { not: null } }, orderBy: { bannedAt: 'desc' }, select: { id: true, displayName: true, banReason: true, bannedAt: true } }),
      prisma.unbanRequest.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: 'asc' }, include: { user: { select: { displayName: true } } } }),
    ]);
    return {
      bans: users.map((u) => ({ userId: u.id, displayName: u.displayName, reason: u.banReason, bannedAt: u.bannedAt!.toISOString() })),
      unbanRequests: requests.map((r) => ({ id: r.id, userId: r.userId, displayName: r.user.displayName, message: r.message, createdAt: r.createdAt.toISOString() })),
    };
  });

  // Declining leaves them banned; they can ask again.
  app.post<{ Params: { id: string } }>('/api/admin/unban-requests/:id/decline', async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const req = await prisma.unbanRequest.findUnique({ where: { id: request.params.id }, include: { user: { select: { displayName: true } } } });
    if (!req) throw new HttpError(404, 'Request not found');
    if (!req.resolvedAt) {
      await prisma.unbanRequest.update({ where: { id: req.id }, data: { resolvedAt: new Date(), resolvedBy: actorId, declined: true } });
      await logAdminAction({ actorId, actorLabel: actor.email, action: 'user.unban_declined', targetLabel: req.user.displayName, metadata: { requestId: req.id } });
    }
    return { ok: true };
  });

  // A banned person's one way to speak up. Allowed while banned; one open request at a time.
  app.post<{ Body: { message?: string } }>(
    '/api/me/unban-request',
    { config: { allowWhileBanned: true, rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request) => {
      const me = await request.requireAuth();
      const user = await prisma.user.findUnique({ where: { id: me }, select: { displayName: true, bannedAt: true } });
      if (!user?.bannedAt) throw new HttpError(400, 'Your account is not banned');
      const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
      if (!message) throw new HttpError(400, 'Tell us why you should be unbanned');
      if (message.length > MAX_REASON_LENGTH) throw new HttpError(400, `Keep the message under ${MAX_REASON_LENGTH} characters`);
      if ((await prisma.unbanRequest.count({ where: { userId: me, resolvedAt: null } })) > 0) throw new HttpError(409, 'You have already asked. An administrator will look at it.');
      await prisma.unbanRequest.create({ data: { userId: me, message } });
      void notifyAdmins('admin_unban_request', `${user.displayName} asked to be unbanned. Open Reports on the Administrator page to answer.`);
      return { ok: true };
    },
  );
}
