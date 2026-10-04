import type { FastifyInstance } from 'fastify';
import { sortPlatforms, type RoomPlatform } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { requireMembership } from '../services/roomAccess.js';

/** Issue #799: the systems a room's members own between them (each member's "Systems owned"),
 * for the room header's platform filter. Members only; just the platform keys, no per-member split. */
export default async function roomSystemsRoutes(app: FastifyInstance) {
  app.get<{ Params: { roomId: string } }>('/api/rooms/:roomId/systems', async (request) => {
    const userId = await request.requireAuth();
    const { roomId } = request.params;
    await requireMembership(roomId, userId);

    const members = await prisma.roomMember.findMany({ where: { roomId }, select: { user: { select: { ownedPlatforms: true } } } });
    const systems = sortPlatforms(Array.from(new Set(members.flatMap((m) => m.user.ownedPlatforms as RoomPlatform[]))));
    return { systems };
  });
}
