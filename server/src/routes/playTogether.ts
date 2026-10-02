import type { FastifyInstance } from 'fastify';
import type { AcceptPlayTogetherRequest, AcceptPlayTogetherResponse, PlayTogetherRoomsResponse } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { generateUniqueInviteCode } from '../services/roomAccess.js';
import { createGameForUser } from '../services/gameIntake.js';
import { ownershipPlatformsOverlap } from './publicProfile.js';

/** "Ask to play together": someone who owns the same game as you asks to play it with you. It lands
 * in your notifications with a choice - add the game to a room you're both in, or start a new room
 * with just the two of you. */
export default async function playTogetherRoutes(app: FastifyInstance) {
  app.post<{ Body: { userId?: string; igdbId?: number } }>(
    '/api/play-together',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request) => {
      const me = await request.requireAuth();
      const { userId: targetId, igdbId } = request.body ?? {};
      if (typeof targetId !== 'string' || !Number.isInteger(igdbId)) throw new HttpError(400, 'A user and a game are required');
      if (targetId === me) throw new HttpError(400, "You can't ask yourself");

      // Both must own it, on a platform in common - the same rule as "You both own this".
      const [mine, theirs, theirGame, asker] = await Promise.all([
        prisma.gameOwnership.findFirst({ where: { userId: me, igdbId }, select: { platforms: true } }),
        prisma.gameOwnership.findFirst({ where: { userId: targetId, igdbId }, select: { platforms: true } }),
        prisma.game.findFirst({ where: { roomId: null, addedBy: targetId, igdbId, hiddenFromOthers: false }, select: { id: true, title: true } }),
        prisma.user.findUnique({ where: { id: me }, select: { displayName: true } }),
      ]);
      if (!mine || !theirs || !theirGame || !ownershipPlatformsOverlap(mine.platforms, theirs.platforms)) {
        throw new HttpError(400, 'You both need to own this game to play it together');
      }

      // One open ask per game is enough.
      const open = await prisma.notification.findFirst({
        where: { recipientId: targetId, actorId: me, gameId: theirGame.id, type: 'play_together_request', readAt: null },
        select: { id: true },
      });
      if (!open) {
        await prisma.notification.create({
          data: {
            recipientId: targetId,
            actorId: me,
            roomName: 'Personal Shelf',
            gameId: theirGame.id,
            type: 'play_together_request',
            message: `${asker?.displayName ?? 'Someone'} wants to play ${theirGame.title} together`,
          },
        });
      }
      return { sent: true };
    },
  );

  async function loadRequest(id: string, userId: string) {
    const n = await prisma.notification.findUnique({ where: { id }, include: { actor: true, game: true } });
    if (!n || n.recipientId !== userId || n.type !== 'play_together_request' || !n.actorId || !n.actor) {
      throw new HttpError(404, 'Request not found');
    }
    return { notification: n, asker: n.actor, game: n.game };
  }

  app.get<{ Params: { id: string } }>('/api/play-together/:id/rooms', async (request): Promise<PlayTogetherRoomsResponse> => {
    const me = await request.requireAuth();
    const { asker } = await loadRequest(request.params.id, me);
    const rooms = await prisma.room.findMany({
      where: { AND: [{ members: { some: { userId: me } } }, { members: { some: { userId: asker.id } } }] },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { rooms };
  });

  app.post<{ Params: { id: string }; Body: AcceptPlayTogetherRequest }>(
    '/api/play-together/:id/accept',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request): Promise<AcceptPlayTogetherResponse> => {
      const me = await request.requireAuth();
      const { notification, asker, game } = await loadRequest(request.params.id, me);
      if (!game) throw new HttpError(404, 'That game is no longer on your shelf');

      let roomId = request.body?.roomId;
      let roomName: string;
      let created = false;
      if (roomId) {
        const room = await prisma.room.findFirst({
          where: { id: roomId, AND: [{ members: { some: { userId: me } } }, { members: { some: { userId: asker.id } } }] },
          select: { id: true, name: true },
        });
        if (!room) throw new HttpError(403, 'You both need to be members of that room');
        roomName = room.name;
      } else {
        const meUser = await prisma.user.findUniqueOrThrow({ where: { id: me }, select: { displayName: true } });
        roomName = `${meUser.displayName} & ${asker.displayName}`.slice(0, 60);
        const room = await prisma.room.create({
          data: {
            name: roomName,
            platform: null,
            accentColor: '#8b5cf6',
            createdBy: me,
            inviteCode: await generateUniqueInviteCode(),
            members: { create: [{ userId: me, role: 'room_master' }, { userId: asker.id, role: 'member' }] },
          },
        });
        roomId = room.id;
        created = true;
      }

      try {
        await createGameForUser(me, roomId, game.igdbId);
      } catch (err) {
        // Already in that room: fine, that's what was wanted.
        if (!(err instanceof HttpError && err.statusCode === 409)) throw err;
      }
      await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
      return { roomId, roomName, created };
    },
  );
}
