import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { HttpError } from '../util/httpError.js';
import { requireMembership } from '../services/roomAccess.js';
import { spinLobbyHub } from '../services/spinLobbyInstance.js';

/** The room lobby's live connection: a WebSocket per member (see services/spinLobbyHub.ts and
 * packages/shared/src/spinLobby.ts for the messages). Members only. Sign-in and membership are
 * checked before the connection is upgraded, so a refused request is an ordinary 401/403/404. */
const appOrigin = new URL(env.APP_BASE_URL).origin;

// Who each upgrade request belongs to, set by the onRequest check below.
const userByRequest = new WeakMap<FastifyRequest, string>();

export default async function spinLobbyRoutes(app: FastifyInstance) {
  app.get<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId/lobby',
    {
      websocket: true,
      // A tighter limit than the default: opening a connection is not something a normal session does often.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      onRequest: async (request) => {
        // Browsers do not apply the same-origin policy to WebSockets, so a page on another site could
        // open this with the member's cookie. Browsers always send Origin on the upgrade: it must be ours.
        if (request.headers.origin !== appOrigin) throw new HttpError(403, 'Cross-origin request refused');
        const userId = await request.requireAuth();
        await requireMembership(request.params.roomId, userId);
        userByRequest.set(request, userId);
      },
    },
    (socket, request) => {
      const userId = userByRequest.get(request);
      if (!userId) {
        socket.close(1008, 'Not signed in');
        return;
      }
      const { roomId } = request.params;
      spinLobbyHub.connect(roomId, userId, socket);
      socket.on('message', (data: Buffer | string) => spinLobbyHub.message(roomId, socket, data.toString()));
      socket.on('close', () => spinLobbyHub.disconnect(roomId, socket));
      socket.on('error', () => spinLobbyHub.disconnect(roomId, socket));
    },
  );
}
