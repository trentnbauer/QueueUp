import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  MINIGAME_LOBBY_MAX_PLAYERS,
  MINIGAME_LOBBY_VISIBILITIES,
  formatLobbyCode,
  parseLobbyCode,
  type CreateMiniGameLobbyRequest,
  type JoinMiniGameLobbyRequest,
  type MiniGameLobbiesResponse,
  type MiniGameLobbyDto,
} from '@queueup/shared';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { isBlockedEitherWay } from '../services/blocks.js';
import { areFriends } from '../services/friendships.js';
import { isLobbyGameId } from '../services/miniGameScores.js';
import { lobbyKey, mayOpenLobby, openLobbies, type OpenLobby } from '../services/openLobbies.js';
import { spinLobbyHub } from '../services/spinLobbyInstance.js';

/** Lobbies anyone can open from the Mini games page (no room needed): public, friends only or by invite
 * code. They run in the same hub as a room's lobby (services/spinLobbyHub.ts) under `lobby:<id>`, stay open
 * until the last person leaves, and every run counts toward high scores. */
const appOrigin = new URL(env.APP_BASE_URL).origin;
const userByRequest = new WeakMap<FastifyRequest, string>();

async function relation(lobby: OpenLobby, userId: string) {
  if (userId === lobby.hostId) return { friend: true, blocked: false };
  const [friend, blocked] = await Promise.all([areFriends(userId, lobby.hostId), isBlockedEitherWay(userId, lobby.hostId)]);
  return { friend, blocked };
}

async function toDto(lobby: OpenLobby, viewerId: string): Promise<MiniGameLobbyDto> {
  const ids = spinLobbyHub.presentIds(lobbyKey(lobby.id));
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, avatarColor: true, avatarUrl: true } }) : [];
  const mine = lobby.hostId === viewerId;
  return {
    id: lobby.id,
    visibility: lobby.visibility,
    game: lobby.game,
    timeLimit: lobby.timeLimit,
    solo: lobby.solo,
    hostId: lobby.hostId,
    mine,
    code: mine && lobby.code ? formatLobbyCode(lobby.code) : null,
    // In the order they arrived.
    players: ids.flatMap((id) => users.filter((u) => u.id === id)),
  };
}

/** The lobby, if this person may open it. 404 for anything they may not see, so a code lobby's id leaks nothing. */
async function openableLobby(id: string, userId: string): Promise<OpenLobby> {
  const lobby = openLobbies.get(id);
  if (!lobby || !mayOpenLobby(lobby, userId, await relation(lobby, userId))) throw new HttpError(404, 'That lobby is closed');
  return lobby;
}

export default async function miniGameLobbyRoutes(app: FastifyInstance) {
  app.get('/api/minigames/lobbies', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request): Promise<MiniGameLobbiesResponse> => {
    const userId = await request.requireAuth();
    openLobbies.purge((id) => spinLobbyHub.hasMembers(lobbyKey(id)));
    const lobbies: MiniGameLobbyDto[] = [];
    for (const lobby of openLobbies.all()) {
      if (lobby.solo) continue; // a practice lobby is nobody's business but its player's
      const mine = lobby.hostId === userId;
      // A lobby with nobody in it yet is not worth showing others, and an invite-code one is only shown to its host.
      if (!mine && (lobby.visibility === 'code' || !spinLobbyHub.hasMembers(lobbyKey(lobby.id)))) continue;
      if (!mayOpenLobby(lobby, userId, await relation(lobby, userId))) continue;
      lobbies.push(await toDto(lobby, userId));
    }
    return { lobbies };
  });

  app.get<{ Params: { id: string } }>('/api/minigames/lobbies/:id', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    return toDto(await openableLobby(request.params.id, userId), userId);
  });

  app.post<{ Body: CreateMiniGameLobbyRequest }>('/api/minigames/lobbies', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    const { visibility, game, timeLimit, solo } = request.body ?? ({} as Partial<CreateMiniGameLobbyRequest>);
    if (!MINIGAME_LOBBY_VISIBILITIES.includes(visibility as never)) throw new HttpError(400, 'Unknown visibility');
    if (game !== null && !isLobbyGameId(game)) throw new HttpError(400, 'Unknown game');
    if (solo === true && !game) throw new HttpError(400, 'A practice lobby needs a game');
    openLobbies.purge((id) => spinLobbyHub.hasMembers(lobbyKey(id)));
    const made = openLobbies.create(userId, visibility, game ?? null, timeLimit === true, solo === true);
    if (!made) throw new HttpError(503, 'Too many lobbies are open. Try again in a moment.');
    // Starting a new lobby closes the one they were hosting (a practice lobby replaces only their last practice lobby).
    if (made.replaced) spinLobbyHub.closeRoom(lobbyKey(made.replaced.id));
    return toDto(made.lobby, userId);
  });

  app.post<{ Body: JoinMiniGameLobbyRequest }>(
    '/api/minigames/lobbies/join',
    // Codes are 6 characters, so guessing one has to be slow.
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const code = parseLobbyCode(typeof request.body?.code === 'string' ? request.body.code : '');
      const lobby = code ? openLobbies.byCode(code) : undefined;
      if (!lobby || (await relation(lobby, userId)).blocked || !spinLobbyHub.hasMembers(lobbyKey(lobby.id))) throw new HttpError(404, 'That code is not an open lobby');
      lobby.allowed.add(userId);
      return toDto(lobby, userId);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/minigames/lobbies/:id', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const userId = await request.requireAuth();
    const lobby = openLobbies.get(request.params.id);
    if (!lobby || lobby.hostId !== userId) throw new HttpError(404, 'That lobby is closed');
    openLobbies.close(lobby.id);
    spinLobbyHub.closeRoom(lobbyKey(lobby.id));
    return reply.code(204).send();
  });

  // The live connection: the same messages as a room's lobby (see routes/spinLobby.ts).
  app.get<{ Params: { id: string } }>(
    '/api/minigames/lobbies/:id/lobby',
    {
      websocket: true,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      onRequest: async (request) => {
        // Browsers do not apply the same-origin policy to WebSockets: the page must be ours.
        if (request.headers.origin !== appOrigin) throw new HttpError(403, 'Cross-origin request refused');
        const userId = await request.requireAuth();
        await openableLobby(request.params.id, userId);
        const key = lobbyKey(request.params.id);
        if (!spinLobbyHub.isPresent(key, userId) && spinLobbyHub.presentIds(key).length >= MINIGAME_LOBBY_MAX_PLAYERS) throw new HttpError(409, 'That lobby is full');
        userByRequest.set(request, userId);
      },
    },
    (socket, request) => {
      const userId = userByRequest.get(request);
      const lobby = openLobbies.get(request.params.id);
      if (!userId || !lobby) {
        socket.close(1008, 'Not available');
        return;
      }
      const key = lobbyKey(lobby.id);
      spinLobbyHub.connect(key, userId, socket, { game: lobby.game, timeLimit: lobby.timeLimit, solo: lobby.solo });
      socket.on('message', (data: Buffer | string) => spinLobbyHub.message(key, socket, data.toString()));
      socket.on('close', () => spinLobbyHub.disconnect(key, socket));
      socket.on('error', () => spinLobbyHub.disconnect(key, socket));
    },
  );
}
