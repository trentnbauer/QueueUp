import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { toUserDto } from '../util/dto.js';
import { HttpError } from '../util/httpError.js';
import { requireElevated, requireMembership, generateUniqueInviteCode } from '../services/roomAccess.js';
import type { CreateRoomRequest, JoinRoomRequest, Room, RoomMember, RoomPlatform, UpdateRoomRequest } from '@squadqueue/shared';

const ROOM_PLATFORMS: RoomPlatform[] = ['pc', 'xbox', 'playstation', 'switch', 'switch2'];

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

  app.post<{ Params: { roomId: string; userId: string } }>(
    '/api/rooms/:roomId/members/:userId/promote',
    async (request) => {
      const actorId = await request.requireAuth();
      const { roomId, userId: targetUserId } = request.params;

      const actor = await requireMembership(roomId, actorId);
      if (actor.role !== 'room_master') {
        throw new HttpError(403, 'Only the Room Master can promote members');
      }

      const target = await prisma.roomMember.update({
        where: { roomId_userId: { roomId, userId: targetUserId } },
        data: { role: 'moderator' },
      });
      return { role: target.role };
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
