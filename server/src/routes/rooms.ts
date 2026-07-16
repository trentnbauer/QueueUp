import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { toUserDto } from '../util/dto.js';
import { HttpError } from '../util/httpError.js';
import { requireElevated, requireMembership, generateUniqueInviteCode } from '../services/roomAccess.js';
import type { CreateRoomRequest, JoinRoomRequest, Room, RoomMember, RoomPlatform, RoomRole, UpdateRoomRequest } from '@squadqueue/shared';

const ROOM_PLATFORMS: RoomPlatform[] = ['pc', 'xbox_360', 'xbox_one', 'xbox_series', 'ps3', 'ps4', 'ps5', 'switch', 'switch2'];
const ROOM_ROLES: RoomRole[] = ['room_master', 'moderator', 'member'];

function toRoomDto(
  room: { id: string; name: string; platform: RoomPlatform; accentColor: string; createdBy: string; createdAt: Date },
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
    const { name, platform, accentColor } = request.body;
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
        members: { create: { userId, role: 'room_master' } },
      },
    });

    reply.status(201);
    return { room: toRoomDto(room, 'room_master', room.inviteCode) };
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

      const membership = await prisma.roomMember.upsert({
        where: { roomId_userId: { roomId: room.id, userId } },
        update: {},
        create: { roomId: room.id, userId, role: 'member' },
      });

      return { room: toRoomDto(room, membership.role, room.inviteCode) };
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

    const { name, platform, accentColor } = request.body;
    if (name !== undefined && !name.trim()) throw new HttpError(400, 'Room name cannot be empty');
    if (platform !== undefined && !ROOM_PLATFORMS.includes(platform)) throw new HttpError(400, 'A valid platform is required');

    const room = await prisma.room.update({
      where: { id: roomId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(platform !== undefined && { platform }),
        ...(accentColor !== undefined && { accentColor }),
      },
    });
    return { room: toRoomDto(room, membership.role, room.inviteCode) };
  });

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

  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/invite-candidates', async (request) => {
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
  });

  app.post<{ Params: { roomId: string }; Body: { userId: string } }>(
    '/api/rooms/:roomId/members',
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

      await prisma.roomMember.create({ data: { roomId, userId: targetUserId, role: 'member' } });
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
        // Ownership transfer: the outgoing Room Master steps down to Moderator rather than being
        // left without a role, and this happens atomically so the room is never left without
        // exactly one Room Master.
        const [, updatedTarget] = await prisma.$transaction([
          prisma.roomMember.update({
            where: { roomId_userId: { roomId, userId: actorId } },
            data: { role: 'moderator' },
          }),
          prisma.roomMember.update({
            where: { roomId_userId: { roomId, userId: targetUserId } },
            data: { role: 'room_master' },
          }),
        ]);
        return { role: updatedTarget.role };
      }

      if (target.role === 'room_master') {
        throw new HttpError(400, 'Transfer ownership to someone else instead of demoting the Room Master directly');
      }

      const updated = await prisma.roomMember.update({
        where: { roomId_userId: { roomId, userId: targetUserId } },
        data: { role },
      });
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
      reply.status(204);
      return null;
    },
  );
}
