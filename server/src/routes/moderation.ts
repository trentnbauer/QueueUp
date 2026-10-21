import type { FastifyInstance } from 'fastify';
import { BAN_REASONS, REPORT_REASONS, type BanReasonCode, type AdminBlockedText, type AdminBan, type AdminUnbanRequest, type AdminUserReport, type BlockedUser, type ReportReason, type ReportUserRequest } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { requireAdmin } from '../services/adminAccess.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import { blockUser } from '../services/blocks.js';
import { env } from '../config/env.js';
import { forgetBan } from '../services/banCache.js';
import { spinLobbyHub } from '../services/spinLobbyInstance.js';
import { clearBannedIdentities, recordBannedIdentities } from '../services/banIdentities.js';
import { notifyAdmins } from '../services/adminNotifications.js';
import { addBannedWord, blockDisplayName, MIN_BANNED_WORD_LENGTH, normalizeDisplayName, placeholderDisplayName } from '../services/displayNames.js';
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
    if (env.PRIVATE_INSTANCE) throw new HttpError(409, 'Blocking is turned off on this server');
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
    const roomId = typeof request.body?.roomId === 'string' ? request.body.roomId : null;
    const reviewGameId = typeof request.body?.reviewGameId === 'string' ? request.body.reviewGameId : null;
    let reportedId = request.body?.userId;
    if (roomId) {
      // A room is reported through its owner. Only people who can see the room (members, or anyone for a public room).
      const room = await prisma.room.findFirst({
        where: { id: roomId, deletedAt: null, OR: [{ isPublic: true }, { members: { some: { userId: me } } }] },
        select: { createdBy: true },
      });
      if (!room) throw new HttpError(404, 'Room not found');
      reportedId = room.createdBy;
    }
    const target = await requireTarget(reportedId, me);
    if (reviewGameId && !(await prisma.gameReview.findUnique({ where: { gameId_userId: { gameId: reviewGameId, userId: target.id } }, select: { gameId: true } }))) {
      throw new HttpError(404, 'Review not found');
    }
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
    const rawReasons = request.body?.reasons ?? [];
    if (!Array.isArray(rawReasons) || !rawReasons.every((r) => (REPORT_REASONS as readonly string[]).includes(r))) throw new HttpError(400, 'Unknown report reason');
    const reasons = [...new Set(rawReasons)] as ReportReason[];
    if (!reason && reasons.length === 0) throw new HttpError(400, 'Pick a reason or tell us why you are reporting them');
    if (reason.length > MAX_REASON_LENGTH) throw new HttpError(400, `Keep the reason under ${MAX_REASON_LENGTH} characters`);
    await prisma.userReport.create({ data: { reporterId: me, reportedUserId: target.id, reason, reasons, roomId, reviewGameId } });
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
      include: { reporter: { select: { id: true, displayName: true } }, reported: { select: { id: true, displayName: true, bannedAt: true, profileSlug: true } } },
    });
    const roomIds = [...new Set(rows.map((r) => r.roomId).filter((x): x is string => !!x))];
    const rooms = roomIds.length > 0 ? await prisma.room.findMany({ where: { id: { in: roomIds }, deletedAt: null }, select: { id: true, name: true } }) : [];
    const roomName = new Map(rooms.map((r) => [r.id, r.name]));
    const reviewKeys = rows.filter((r) => r.reviewGameId).map((r) => ({ gameId: r.reviewGameId!, userId: r.reportedUserId }));
    const reviews = reviewKeys.length > 0 ? await prisma.gameReview.findMany({ where: { OR: reviewKeys }, select: { gameId: true, userId: true, note: true } }) : [];
    const reviewNote = new Map(reviews.map((v) => [`${v.gameId}:${v.userId}`, v.note]));
    return {
      reports: rows.map((r) => ({
        id: r.id,
        profileSlug: r.reported.profileSlug,
        roomId: r.roomId,
        roomName: r.roomId ? (roomName.get(r.roomId) ?? null) : null,
        reviewGameId: r.reviewGameId,
        reviewNote: r.reviewGameId ? (reviewNote.get(`${r.reviewGameId}:${r.reportedUserId}`) ?? null) : null,
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
    await prisma.user.update({ where: { id: report.reported.id }, data: { avatarUrl: null, avatarBlocked: true } });
    await resolveAfterAction(report, actorId);
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'user.reset_avatar', targetLabel: report.reported.displayName, metadata: { userId: report.reported.id, reportId: report.id } });
    await notifyAccountChange(report.reported.id, 'An administrator removed your profile picture because it broke the rules.');
    return { ok: true };
  });


  // The profile link is offensive: remove it and blacklist it. Resolves the report.
  app.post<{ Params: { id: string } }>('/api/admin/reports/:id/remove-profile-link', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const report = await loadReportForAction(request.params.id);
    if (report.reported.isAdmin) throw new HttpError(400, 'Remove their administrator role first');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: report.reported.id }, select: { profileSlug: true } });
    if (user.profileSlug) await blockDisplayName(user.profileSlug, actorId);
    await prisma.user.update({ where: { id: report.reported.id }, data: { profileSlug: null } });
    await resolveAfterAction(report, actorId);
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'user.remove_profile_link', targetLabel: report.reported.displayName, metadata: { userId: report.reported.id, slug: user.profileSlug, reportId: report.id } });
    await notifyAccountChange(report.reported.id, 'An administrator removed your custom profile link because it broke the rules.');
    return { ok: true };
  });

  // The room name is offensive: rename it to a neutral one and blacklist the old name. Resolves the report.
  app.post<{ Params: { id: string } }>('/api/admin/reports/:id/reset-room-name', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const report = await loadReportForAction(request.params.id);
    if (!report.roomId) throw new HttpError(400, 'This report is not about a room');
    const room = await prisma.room.findFirst({ where: { id: report.roomId, deletedAt: null }, select: { id: true, name: true, createdBy: true } });
    if (!room) throw new HttpError(404, 'Room not found');
    await blockDisplayName(room.name, actorId);
    await prisma.room.update({ where: { id: room.id }, data: { name: placeholderDisplayName().replace('Player', 'Room') } });
    await resolveAfterAction(report, actorId);
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'room.reset_name', targetLabel: room.name, metadata: { roomId: room.id, reportId: report.id } });
    await notifyAccountChange(room.createdBy, `An administrator renamed your room "${room.name}" because its name broke the rules.`);
    return { ok: true };
  });

  // The review note is offensive: clear it (the scores stay). Resolves the report.
  app.post<{ Params: { id: string } }>('/api/admin/reports/:id/clear-review-note', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const report = await loadReportForAction(request.params.id);
    if (!report.reviewGameId) throw new HttpError(400, 'This report is not about a review');
    await prisma.gameReview.updateMany({ where: { gameId: report.reviewGameId, userId: report.reported.id }, data: { note: null } });
    await resolveAfterAction(report, actorId);
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'review.clear_note', targetLabel: report.reported.displayName, metadata: { gameId: report.reviewGameId, reportId: report.id } });
    await notifyAccountChange(report.reported.id, 'An administrator removed the note on one of your reviews because it broke the rules.');
    return { ok: true };
  });

  // The blacklist: whole names nobody may use, and banned words (see services/displayNames.ts).
  app.get('/api/admin/blocked-text', async (request): Promise<AdminBlockedText> => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);
    const [names, words] = await Promise.all([
      prisma.blockedDisplayName.findMany({ orderBy: { createdAt: 'desc' }, select: { normalized: true, example: true }, take: 500 }),
      prisma.bannedWord.findMany({ orderBy: { createdAt: 'desc' }, select: { normalized: true, example: true }, take: 500 }),
    ]);
    return { names, words };
  });

  app.post<{ Body: { word?: string } }>('/api/admin/banned-words', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const word = typeof request.body?.word === 'string' ? request.body.word.trim() : '';
    if (!(await addBannedWord(word, actorId))) throw new HttpError(400, `A banned word needs at least ${MIN_BANNED_WORD_LENGTH} letters or numbers`);
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'banned_word.add', targetLabel: word.slice(0, 80) });
    return { ok: true };
  });

  app.delete<{ Params: { normalized: string } }>('/api/admin/banned-words/:normalized', async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const normalized = normalizeDisplayName(request.params.normalized);
    await prisma.bannedWord.deleteMany({ where: { normalized } });
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'banned_word.remove', targetLabel: normalized });
    return { ok: true };
  });

  app.delete<{ Params: { normalized: string } }>('/api/admin/blocked-names/:normalized', async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const normalized = normalizeDisplayName(request.params.normalized);
    await prisma.blockedDisplayName.deleteMany({ where: { normalized } });
    await logAdminAction({ actorId, actorLabel: actor.email, action: 'blocked_name.remove', targetLabel: normalized });
    return { ok: true };
  });

  const MAX_BAN_REASON = 500;

  app.post<{ Params: { id: string }; Body: { reason?: string; code?: string } }>('/api/admin/users/:id/ban', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    const actorId = await request.requireAuth();
    const actor = await requireAdmin(actorId);
    const target = await prisma.user.findUnique({ where: { id: request.params.id }, select: { id: true, displayName: true, isAdmin: true, bannedAt: true } });
    if (!target) throw new HttpError(404, 'User not found');
    if (target.id === actorId) throw new HttpError(400, "You can't ban yourself");
    if (target.isAdmin) throw new HttpError(400, 'Remove their administrator role before banning them');
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
    if (reason.length > MAX_BAN_REASON) throw new HttpError(400, `Keep the reason under ${MAX_BAN_REASON} characters`);
    const code = request.body?.code ?? 'other';
    if (!(BAN_REASONS as readonly string[]).includes(code)) throw new HttpError(400, 'Unknown ban reason');
    if (!target.bannedAt) {
      await prisma.user.update({ where: { id: target.id }, data: { bannedAt: new Date(), banReason: reason || null, banReasonCode: code } });
      await recordBannedIdentities(target.id);
      forgetBan(target.id);
      spinLobbyHub.kickEverywhere(target.id, 'Banned');
      await logAdminAction({ actorId, actorLabel: actor.email, action: 'user.ban', targetLabel: target.displayName, metadata: { userId: target.id, code, reason: reason || null } });
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
        prisma.user.update({ where: { id: target.id }, data: { bannedAt: null, banReason: null, banReasonCode: null } }),
        prisma.unbanRequest.updateMany({ where: { userId: target.id, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedBy: actorId } }),
      ]);
      await clearBannedIdentities(target.id);
      forgetBan(target.id);
      await logAdminAction({ actorId, actorLabel: actor.email, action: 'user.unban', targetLabel: target.displayName, metadata: { userId: target.id } });
    }
    return { ok: true };
  });

  app.get('/api/admin/bans', async (request): Promise<{ bans: AdminBan[]; unbanRequests: AdminUnbanRequest[] }> => {
    const userId = await request.requireAuth();
    await requireAdmin(userId);
    const [users, requests] = await Promise.all([
      prisma.user.findMany({ where: { bannedAt: { not: null } }, orderBy: { bannedAt: 'desc' }, select: { id: true, displayName: true, banReason: true, banReasonCode: true, bannedAt: true } }),
      prisma.unbanRequest.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: 'asc' }, include: { user: { select: { displayName: true } } } }),
    ]);
    return {
      bans: users.map((u) => ({ userId: u.id, displayName: u.displayName, reasonCode: u.banReasonCode as BanReasonCode | null, reason: u.banReason, bannedAt: u.bannedAt!.toISOString() })),
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
