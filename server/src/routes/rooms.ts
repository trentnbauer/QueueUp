import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { toUserDto } from '../util/dto.js';
import { HttpError } from '../util/httpError.js';
import { requireElevated, requireMembership, generateUniqueInviteCode, getRoom } from '../services/roomAccess.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import { notifyRoom, notifyRoomMembersDirect } from '../services/notifications.js';
import { unlockBadges } from '../services/badges.js';
import { logRoomActivity, getRoomActivityPage, encodeActivityCursor, decodeActivityCursor } from '../services/roomActivity.js';
import type {
  CreateRoomRequest,
  JoinRoomRequest,
  PublicRoomSummary,
  Room,
  RoomActivityPage,
  RoomMember,
  RoomPlatform,
  RoomRole,
  SpinWheelTheme,
  UpdateRoomRequest,
} from '@queueup/shared';
import { ROOM_PLATFORM_LABELS } from '@queueup/shared';

const ROOM_PLATFORMS: RoomPlatform[] = ['pc', 'xbox_360', 'xbox_one', 'xbox_series', 'ps3', 'ps4', 'ps5', 'switch', 'switch2'];
const ROOM_ROLES: RoomRole[] = ['room_master', 'moderator', 'member'];
const SPIN_WHEEL_THEMES: SpinWheelTheme[] = ['slot', 'crate', 'card_flip', 'roulette', 'random'];

function toRoomDto(
  room: {
    id: string;
    name: string;
    platform: RoomPlatform;
    accentColor: string;
    createdBy: string;
    createdAt: Date;
    discordWebhookUrl: string | null;
    spinOwnershipMaxPrice: number;
    spinWheelTheme: SpinWheelTheme;
    isPublic: boolean;
    requireGameApproval: boolean;
  },
  role: Room['myRole'],
  inviteCode: string,
): Room {
  return {
    id: room.id,
    name: room.name,
    platform: room.platform,
    accentColor: room.accentColor,
    createdBy: room.createdBy,
    createdAt: room.createdAt.toISOString(),
    myRole: role,
    inviteCode,
    // The webhook URL embeds Discord's own auth token (discord.com/api/webhooks/<id>/<token>) -
    // whoever has it can post to that channel as the webhook, so only the Room Master (who can
    // also change it) gets the real value; other members just don't see it at all.
    discordWebhookUrl: role === 'room_master' ? room.discordWebhookUrl : undefined,
    spinOwnershipMaxPrice: room.spinOwnershipMaxPrice,
    spinWheelTheme: room.spinWheelTheme,
    isPublic: room.isPublic,
    requireGameApproval: room.requireGameApproval,
  };
}

export default async function roomRoutes(app: FastifyInstance) {
  app.get('/api/rooms', async (request) => {
    const userId = await request.requireAuth();
    const memberships = await prisma.roomMember.findMany({
      where: { userId },
      include: { room: true },
      orderBy: { joinedAt: 'asc' },
    });
    const rooms: Room[] = memberships.map((m) => toRoomDto(m.room, m.role, m.room.inviteCode));
    return { rooms };
  });

  app.post<{ Body: CreateRoomRequest }>('/api/rooms', async (request, reply) => {
    const userId = await request.requireAuth();
    const { name, platform, accentColor, isPublic } = request.body;
    if (!name?.trim()) throw new HttpError(400, 'Room name is required');
    if (!ROOM_PLATFORMS.includes(platform)) throw new HttpError(400, 'A valid platform is required');

    const inviteCode = await generateUniqueInviteCode();

    const room = await prisma.room.create({
      data: {
        name: name.trim(),
        platform,
        accentColor: accentColor || '#8b5cf6',
        createdBy: userId,
        inviteCode,
        isPublic: Boolean(isPublic),
        members: { create: { userId, role: 'room_master' } },
      },
    });

    reply.status(201);
    const unlockedBadges = await unlockBadges(userId, ['first_room_created']);
    return { room: toRoomDto(room, 'room_master', room.inviteCode), unlockedBadges };
  });

  app.post<{ Body: JoinRoomRequest }>(
    '/api/rooms/join',
    // Invite codes are the sole access-control secret for private rooms - a tight limit here
    // makes brute-forcing one impractical regardless of the global rate limit.
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { inviteCode } = request.body;
      if (!inviteCode?.trim()) throw new HttpError(400, 'Invite code is required');

      const room = await prisma.room.findUnique({ where: { inviteCode: inviteCode.trim() } });
      if (!room) throw new HttpError(404, 'Invalid invite code');

      // A plain create (rather than a check-then-upsert) makes "did this request actually create
      // the membership" atomic: the unique constraint on (roomId, userId) is the single source of
      // truth, so two concurrent join requests for the same user can't both believe they were first
      // and both fire a "joined the room" notification.
      let membership;
      let isNewJoin = false;
      try {
        membership = await prisma.roomMember.create({ data: { roomId: room.id, userId, role: 'member' } });
        isNewJoin = true;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          membership = await prisma.roomMember.findUniqueOrThrow({ where: { roomId_userId: { roomId: room.id, userId } } });
        } else {
          throw err;
        }
      }

      if (isNewJoin) {
        await notifyRoom({
          roomId: room.id,
          roomName: room.name,
          actorId: userId,
          type: 'member_joined',
          message: (actorName) => `${actorName} joined the room`,
        });
      }

      const unlockedBadges = isNewJoin ? await unlockBadges(userId, ['first_private_join']) : [];
      return { room: toRoomDto(room, membership.role, room.inviteCode), unlockedBadges };
    },
  );

  // Room directory for the "Browse public rooms" flow in AddRoomModal - only rooms the caller
  // isn't already a member of (their own public rooms already show up in the sidebar via
  // GET /api/rooms), and deliberately excludes invite codes / webhook URLs / other member-only
  // data since the caller isn't a member yet.
  app.get('/api/rooms/public', async (request) => {
    const userId = await request.requireAuth();
    const rooms = await prisma.room.findMany({
      where: {
        isPublic: true,
        members: { none: { userId } },
      },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const summaries: PublicRoomSummary[] = rooms.map((room) => ({
      id: room.id,
      name: room.name,
      platform: room.platform,
      accentColor: room.accentColor,
      memberCount: room._count.members,
    }));
    return { rooms: summaries };
  });

  app.post<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/join-public',
    // Instant, no-approval self-join is membership-granting on demand - same tier of limit as
    // the invite-code join endpoint above, so this can't be hammered to spam-join/leave rooms.
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;

      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) throw new HttpError(404, 'Room not found');
      if (!room.isPublic) throw new HttpError(403, 'This room is invite-only');

      // Same idempotent create-with-P2002-fallback pattern as POST /api/rooms/join - the unique
      // constraint on (roomId, userId) is the single source of truth for "did this request
      // actually create the membership", so concurrent join requests can't double-fire the
      // "joined the room" notification.
      let membership;
      let isNewJoin = false;
      try {
        membership = await prisma.roomMember.create({ data: { roomId: room.id, userId, role: 'member' } });
        isNewJoin = true;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          membership = await prisma.roomMember.findUniqueOrThrow({ where: { roomId_userId: { roomId: room.id, userId } } });
        } else {
          throw err;
        }
      }

      if (isNewJoin) {
        await notifyRoom({
          roomId: room.id,
          roomName: room.name,
          actorId: userId,
          type: 'member_joined',
          message: (actorName) => `${actorName} joined the room`,
        });
      }

      const unlockedBadges = isNewJoin ? await unlockBadges(userId, ['first_public_join']) : [];
      return { room: toRoomDto(room, membership.role, room.inviteCode), unlockedBadges };
    },
  );

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    const membership = await requireMembership(roomId, userId);

    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    return { room: toRoomDto(room, membership.role, room.inviteCode) };
  });

  app.patch<{ Params: { roomId: string }; Body: UpdateRoomRequest }>('/api/rooms/:roomId', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    const membership = await requireMembership(roomId, userId);
    if (membership.role !== 'room_master') {
      throw new HttpError(403, 'Only the Room Master can change room settings');
    }

    const { name, platform, accentColor, discordWebhookUrl, spinOwnershipMaxPrice, spinWheelTheme, isPublic, requireGameApproval } =
      request.body;
    if (name !== undefined && !name.trim()) throw new HttpError(400, 'Room name cannot be empty');
    if (platform !== undefined && !ROOM_PLATFORMS.includes(platform)) throw new HttpError(400, 'A valid platform is required');
    if (spinWheelTheme !== undefined && !SPIN_WHEEL_THEMES.includes(spinWheelTheme)) {
      throw new HttpError(400, 'A valid Spin the Wheel theme is required');
    }
    if (spinOwnershipMaxPrice !== undefined && (!Number.isInteger(spinOwnershipMaxPrice) || spinOwnershipMaxPrice < 0)) {
      throw new HttpError(400, 'Spin ownership price threshold must be a whole dollar amount, 0 or more');
    }
    // Restricted to Discord's own webhook host (not an arbitrary URL) - this app POSTs to
    // whatever's stored here, so accepting any URL would make this an open SSRF vector for
    // whoever can set it (the Room Master, but still - internal network probing shouldn't be
    // reachable through a "paste your webhook URL" field).
    if (
      discordWebhookUrl !== undefined &&
      discordWebhookUrl !== null &&
      !/^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(discordWebhookUrl)
    ) {
      throw new HttpError(400, 'That doesn\'t look like a Discord webhook URL');
    }

    const before = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    const room = await prisma.room.update({
      where: { id: roomId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(platform !== undefined && { platform }),
        ...(accentColor !== undefined && { accentColor }),
        ...(discordWebhookUrl !== undefined && { discordWebhookUrl }),
        ...(spinOwnershipMaxPrice !== undefined && { spinOwnershipMaxPrice }),
        ...(spinWheelTheme !== undefined && { spinWheelTheme }),
        ...(isPublic !== undefined && { isPublic }),
        ...(requireGameApproval !== undefined && { requireGameApproval }),
      },
    });

    if (name !== undefined && room.name !== before.name) {
      await notifyRoom({
        roomId,
        roomName: room.name,
        actorId: userId,
        type: 'room_renamed',
        message: (actorName) => `${actorName} renamed the room from "${before.name}" to "${room.name}"`,
      });
    }
    if (platform !== undefined && room.platform !== before.platform) {
      await notifyRoom({
        roomId,
        roomName: room.name,
        actorId: userId,
        type: 'room_platform_changed',
        message: (actorName) => `${actorName} changed the room's platform to ${ROOM_PLATFORM_LABELS[room.platform]}`,
      });
    }
    return { room: toRoomDto(room, membership.role, room.inviteCode) };
  });

  app.delete<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId',
    // Destructive and cascades to every member/game in the room - same tier of limit as
    // /api/rooms/join above, for the same reason: this should never legitimately happen at volume.
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const actorId = await request.requireAuth();
      const { roomId } = request.params;
      const membership = await requireMembership(roomId, actorId);
      if (membership.role !== 'room_master') {
        throw new HttpError(403, 'Only the Room Master can delete this room');
      }

      const [actor, target, members] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: actorId } }),
        prisma.room.findUnique({
          where: { id: roomId },
          include: { _count: { select: { members: true, games: true } } },
        }),
        prisma.roomMember.findMany({ where: { roomId }, select: { userId: true } }),
      ]);

      await prisma.room.delete({ where: { id: roomId } });

      if (target) {
        await notifyRoomMembersDirect({
          roomName: target.name,
          actorId,
          recipientIds: members.map((m) => m.userId),
          type: 'room_deleted',
          message: (actorName) => `${actorName} deleted the room "${target.name}"`,
        });
      }

      app.log.warn(
        {
          action: 'room.delete',
          actorId,
          targetId: roomId,
          targetName: target?.name,
          memberCount: target?._count.members,
          gameCount: target?._count.games,
        },
        `Room Master ${actorId} deleted room ${roomId} (${target?.name ?? 'unknown'}), cascading ${target?._count.members ?? 0} member(s) and ${target?._count.games ?? 0} game(s)`,
      );
      await logAdminAction({
        actorId,
        actorLabel: actor.email,
        action: 'room.delete',
        targetLabel: target?.name ?? roomId,
        metadata: { memberCount: target?._count.members, gameCount: target?._count.games },
      });

      reply.status(204);
      return null;
    },
  );

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/members', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    await requireMembership(roomId, userId);

    const members = await prisma.roomMember.findMany({
      where: { roomId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });

    const dtos: RoomMember[] = members.map((m) => ({
      roomId: m.roomId,
      user: toUserDto(m.user),
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));
    return { members: dtos };
  });

  // Powers the member list's "completed / 100%'d" counts (click a member to see it). "Completed"
  // counts games this member added to *this* room that are Beaten or queued for Replay - status
  // lives on the Game row, not per-member, so a member's own additions are the only sound way to
  // scope it to them. "100%'d" is a genuinely personal fact (their own Steam achievement progress -
  // see AchievementCompletion), so it's scoped to this room's games regardless of who added them.
  app.get<{ Params: { roomId: string; userId: string } }>(
    '/api/rooms/:roomId/members/:userId/stats',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const requesterId = await request.requireAuth();
      const { roomId, userId: targetUserId } = request.params;
      await requireMembership(roomId, requesterId);
      await requireMembership(roomId, targetUserId);

      const [completedCount, roomGames] = await Promise.all([
        prisma.game.count({
          where: { roomId, addedBy: targetUserId, status: { in: ['done', 'replay'] }, archivedAt: null },
        }),
        prisma.game.findMany({
          where: { roomId, archivedAt: null },
          select: { igdbId: true },
          distinct: ['igdbId'],
        }),
      ]);

      const fullyCompletedCount = await prisma.achievementCompletion.count({
        where: { userId: targetUserId, igdbId: { in: roomGames.map((g) => g.igdbId) } },
      });

      return { completedCount, fullyCompletedCount };
    },
  );

  app.get<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/invite-candidates',
    // Elevated-only, but the response is effectively a dump of every user on the server (minus
    // current members) - a tighter limit than the global default costs a legitimate moderator
    // nothing while blunting use of this as a user-enumeration endpoint.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { roomId } = request.params;
      await requireElevated(roomId, userId);

      const existingMemberIds = (
        await prisma.roomMember.findMany({ where: { roomId }, select: { userId: true } })
      ).map((m) => m.userId);

      const candidates = await prisma.user.findMany({
        where: { id: { notIn: existingMemberIds } },
        orderBy: { displayName: 'asc' },
      });
      return { users: candidates.map(toUserDto) };
    },
  );

  app.post<{ Params: { roomId: string }; Body: { userId: string } }>(
    '/api/rooms/:roomId/members',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const actorId = await request.requireAuth();
      const { roomId } = request.params;
      const { userId: targetUserId } = request.body;
      await requireElevated(roomId, actorId);
      if (!targetUserId) throw new HttpError(400, 'A user id is required');

      const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) throw new HttpError(404, 'User not found');

      const existing = await prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId, userId: targetUserId } },
      });
      if (existing) throw new HttpError(400, 'That user is already a member of this room');

      const room = await getRoom(roomId);
      await prisma.roomMember.create({ data: { roomId, userId: targetUserId, role: 'member' } });
      await notifyRoom({
        roomId,
        roomName: room.name,
        actorId,
        type: 'member_joined',
        message: (actorName) => `${actorName} added ${targetUser.displayName} to the room`,
      });
      reply.status(201);
      return { added: true };
    },
  );

  app.patch<{ Params: { roomId: string; userId: string }; Body: { role: RoomRole } }>(
    '/api/rooms/:roomId/members/:userId/role',
    async (request) => {
      const actorId = await request.requireAuth();
      const { roomId, userId: targetUserId } = request.params;
      const { role } = request.body;
      if (!ROOM_ROLES.includes(role)) throw new HttpError(400, 'A valid role is required');

      const actor = await requireMembership(roomId, actorId);
      if (actor.role !== 'room_master') {
        throw new HttpError(403, 'Only the Room Master can change member roles');
      }
      if (targetUserId === actorId) {
        throw new HttpError(400, 'Transfer ownership to another member instead of changing your own role');
      }
      const target = await requireMembership(roomId, targetUserId);

      if (role === 'room_master') {
        const [targetUser, room] = await Promise.all([
          prisma.user.findUniqueOrThrow({ where: { id: targetUserId }, select: { displayName: true } }),
          getRoom(roomId),
        ]);
        // Ownership transfer: the outgoing Room Master steps down to Moderator rather than being
        // left without a role, and this happens atomically so the room is never left without
        // exactly one Room Master. Room.createdBy moves with it - otherwise it silently keeps
        // pointing at whoever originally created the room even after they've fully stepped back,
        // which both misrepresents current ownership (e.g. the admin Rooms table's "Created by")
        // and - since that column has no cascade/set-null - would block the outgoing master from
        // ever deleting their account (see DELETE /api/me) despite no longer actually owning this
        // room.
        const [, updatedTarget] = await prisma.$transaction([
          prisma.roomMember.update({
            where: { roomId_userId: { roomId, userId: actorId } },
            data: { role: 'moderator' },
          }),
          prisma.roomMember.update({
            where: { roomId_userId: { roomId, userId: targetUserId } },
            data: { role: 'room_master' },
          }),
          prisma.room.update({
            where: { id: roomId },
            data: { createdBy: targetUserId },
          }),
        ]);
        await notifyRoom({
          roomId,
          roomName: room.name,
          actorId,
          type: 'room_owner_changed',
          message: (actorName) => `${actorName} transferred room ownership to ${targetUser.displayName}`,
        });
        // Promoted (issue: "what other achievements can you think of") - an ownership transfer is
        // unambiguously a promotion for the target (they can't have already been room_master, per
        // the "only one room_master" invariant this whole branch exists to preserve), so this one
        // doesn't need the target.role-before-update check the plain role-change branch below does.
        // Not surfaced in the response: the actor can never be the target (blocked above), so
        // there's no toast to show *them* for someone else's unlock - it just lands for real
        // (unlockBadges' own DB write), same as Spin Winner in roomSpin.ts crediting whoever added
        // the winning game rather than whoever clicked "Let's play".
        await unlockBadges(targetUserId, ['first_promoted']);
        return { role: updatedTarget.role };
      }

      if (target.role === 'room_master') {
        throw new HttpError(400, 'Transfer ownership to someone else instead of demoting the Room Master directly');
      }

      const updated = await prisma.roomMember.update({
        where: { roomId_userId: { roomId, userId: targetUserId } },
        data: { role },
      });
      // Promoted, continued - only member -> moderator counts (target.role is the value from
      // before this update, fetched above by requireMembership) - moderator -> member is a
      // demotion, not an achievement. Same "not surfaced in the response" reasoning as above.
      if (target.role === 'member' && role === 'moderator') {
        await unlockBadges(targetUserId, ['first_promoted']);
        // Room activity feed (issue #509) - demotions aren't logged here, same "promotion only"
        // scope as the badge just above.
        const targetUser = await prisma.user.findUniqueOrThrow({ where: { id: targetUserId }, select: { displayName: true } });
        void logRoomActivity({
          roomId,
          actorId,
          type: 'member_promoted',
          message: (actorName) => `${actorName} promoted ${targetUser.displayName} to Moderator`,
        });
      }
      return { role: updated.role };
    },
  );

  app.delete<{ Params: { roomId: string; userId: string } }>(
    '/api/rooms/:roomId/members/:userId',
    async (request, reply) => {
      const actorId = await request.requireAuth();
      const { roomId, userId: targetUserId } = request.params;

      const target = await requireMembership(roomId, targetUserId);
      if (target.role === 'room_master') {
        throw new HttpError(400, 'The Room Master cannot be removed');
      }

      const isSelfLeave = actorId === targetUserId;
      if (!isSelfLeave) {
        await requireElevated(roomId, actorId);
      }

      await prisma.roomMember.delete({ where: { roomId_userId: { roomId, userId: targetUserId } } });
      // Room activity feed (issue #509).
      const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { displayName: true } });
      void logRoomActivity({
        roomId,
        actorId,
        type: 'member_left',
        message: (actorName) =>
          isSelfLeave ? `${actorName} left the room` : `${actorName} removed ${targetUser?.displayName ?? 'a member'} from the room`,
      });
      reply.status(204);
      return null;
    },
  );

  const ROOM_ACTIVITY_PAGE_SIZE = 30;

  // Issue #509 - the room activity feed itself. Cursor-paginated on createdAt (`before`), oldest
  // page boundary passed back as `nextBefore` - see RoomActivityPage's own doc comment. Membership
  // gated the same as every other room read (requireMembership), not requireElevated - a plain
  // Member should be able to see their own room's history, not just Moderators/Room Masters.
  app.get<{ Params: { roomId: string }; Querystring: { before?: string } }>('/api/rooms/:roomId/activity', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    await requireMembership(roomId, userId);

    const before = request.query.before ? decodeActivityCursor(request.query.before) : undefined;
    const rows = await getRoomActivityPage(roomId, { before, take: ROOM_ACTIVITY_PAGE_SIZE + 1 });
    const hasMore = rows.length > ROOM_ACTIVITY_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, ROOM_ACTIVITY_PAGE_SIZE) : rows;
    const last = page[page.length - 1];

    const result: RoomActivityPage = {
      entries: page.map((row) => ({
        id: row.id,
        type: row.type,
        message: row.message,
        actor: row.actor ? toUserDto(row.actor) : null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextBefore: hasMore ? encodeActivityCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
    return result;
  });
}
