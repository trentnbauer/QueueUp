import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { HttpError } from '../util/httpError.js';

vi.mock('../config/env.js', () => ({ env: { APP_BASE_URL: 'https://queueup.example', SESSION_SECRET: 'x'.repeat(40), SIGNUP_MODE: 'open', PRIVATE_INSTANCE: false } }));
vi.mock('../db/client.js', () => ({ prisma: { user: { findMany: async () => [] } } }));
vi.mock('../services/friendships.js', () => ({ areFriends: async () => false }));
vi.mock('../services/blocks.js', () => ({ isBlockedEitherWay: async () => false }));
vi.mock('../services/miniGameScores.js', () => ({ isLobbyGameId: (v: unknown) => v === 'dodge' || v === 'runner' }));
vi.mock('../services/spinLobbyInstance.js', async () => {
  const { SpinLobbyHub } = await import('../services/spinLobbyHub.js');
  const { OPEN_LOBBY_PREFIX, openLobbies } = await import('../services/openLobbies.js');
  return {
    spinLobbyHub: new SpinLobbyHub(
      {
        isSpinWaiting: async () => false,
        extendWaitingRoom: async () => false,
        startSpinNow: async () => {},
        onEmpty: (key) => {
          if (key.startsWith(OPEN_LOBBY_PREFIX)) openLobbies.close(key.slice(OPEN_LOBBY_PREFIX.length));
        },
      },
      { autoTick: false },
    ),
  };
});

import miniGameLobbyRoutes from './miniGameLobbies.js';
import { spinLobbyHub } from '../services/spinLobbyInstance.js';
import { openLobbies } from '../services/openLobbies.js';
import { guestNames, newGuestToken } from '../services/guestLobby.js';
import { MINIGAME_LOBBY_MAX_PLAYERS } from '@queueup/shared';

async function build() {
  const app = Fastify();
  await app.register(websocket, { options: { maxPayload: 1024 } });
  app.decorateRequest('requireAuth', async function (this: { headers: Record<string, string | undefined> }) {
    const user = this.headers['x-test-user'];
    if (!user) throw new HttpError(401, 'Not signed in');
    return user;
  } as never);
  app.setErrorHandler((err: unknown, _req, reply) => {
    const e = err as { statusCode?: number; message?: string };
    return reply.status(e.statusCode ?? 500).send({ error: e.message });
  });
  await app.register(miniGameLobbyRoutes);
  await app.ready();
  return app;
}

const ORIGIN = 'https://queueup.example';
const apps: Awaited<ReturnType<typeof build>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  for (const l of openLobbies.all()) openLobbies.close(l.id);
});

async function open(app: Awaited<ReturnType<typeof build>>, host: string, visibility: string, game: string | null = null) {
  return (await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: { 'x-test-user': host }, payload: { visibility, game } })).json();
}

describe('GET /api/minigames/lobbies/:id/lobby', () => {
  it('lets the host in, plays the chosen game, and closes the lobby when the last person leaves', async () => {
    const app = await build();
    apps.push(app);
    const lobby = await open(app, 'alice', 'public', 'dodge');
    const ws = await app.injectWS(`/api/minigames/lobbies/${lobby.id}/lobby`, { headers: { origin: ORIGIN, 'x-test-user': 'alice' } });
    const next = new Promise<{ game: { id: string } }>((resolve) => ws.once('message', (d: Buffer) => resolve(JSON.parse(d.toString()))));
    await spinLobbyHub.tickRoom(`lobby:${lobby.id}`);
    expect((await next).game.id).toBe('dodge');
    expect(openLobbies.get(lobby.id)).toBeDefined();

    ws.terminate();
    await vi.waitFor(() => expect(openLobbies.get(lobby.id)).toBeUndefined());
  });

  it('keeps an invite-code lobby to people who joined with its code', async () => {
    const app = await build();
    apps.push(app);
    const lobby = await open(app, 'alice', 'code');
    const host = await app.injectWS(`/api/minigames/lobbies/${lobby.id}/lobby`, { headers: { origin: ORIGIN, 'x-test-user': 'alice' } });
    await expect(app.injectWS(`/api/minigames/lobbies/${lobby.id}/lobby`, { headers: { origin: ORIGIN, 'x-test-user': 'bob' } })).rejects.toThrow();
    await app.inject({ method: 'POST', url: '/api/minigames/lobbies/join', headers: { 'x-test-user': 'bob' }, payload: { code: lobby.code } });
    const guest = await app.injectWS(`/api/minigames/lobbies/${lobby.id}/lobby`, { headers: { origin: ORIGIN, 'x-test-user': 'bob' } });
    expect(spinLobbyHub.presentIds(`lobby:${lobby.id}`).sort()).toEqual(['alice', 'bob']);
    // The lobby stays open while anyone is still in it.
    host.terminate();
    await vi.waitFor(() => expect(spinLobbyHub.presentIds(`lobby:${lobby.id}`)).toEqual(['bob']));
    expect(openLobbies.get(lobby.id)).toBeDefined();
    guest.terminate();
    await vi.waitFor(() => expect(openLobbies.get(lobby.id)).toBeUndefined());
  });

  it('keeps a guest\'s name only while they are connected, and not at all when their connection is refused', async () => {
    const app = await build();
    apps.push(app);
    const lobby = await open(app, 'alice', 'public');
    const url = (token: string) => `/api/minigames/lobbies/${lobby.id}/lobby?guest=${encodeURIComponent(token)}`;
    const host = await app.injectWS(`/api/minigames/lobbies/${lobby.id}/lobby`, { headers: { origin: ORIGIN, 'x-test-user': 'alice' } });

    const joined = newGuestToken(lobby.id, 'Pete');
    const ws = await app.injectWS(url(joined.token), { headers: { origin: ORIGIN } });
    expect(guestNames.get(joined.guestId)).toBe('Pete');
    ws.terminate();
    await vi.waitFor(() => expect(guestNames.has(joined.guestId)).toBe(false));

    // Fill the lobby: a guest with a good token is then refused, and no name is left behind.
    const others = Array.from({ length: MINIGAME_LOBBY_MAX_PLAYERS - 1 }, (_, i) => `user${i}`);
    const sockets = [];
    for (const user of others) {
      await app.inject({ method: 'POST', url: '/api/minigames/lobbies/join', headers: { 'x-test-user': user }, payload: { code: '' } }).catch(() => undefined);
      sockets.push(await app.injectWS(`/api/minigames/lobbies/${lobby.id}/lobby`, { headers: { origin: ORIGIN, 'x-test-user': user } }));
    }
    const refused = newGuestToken(lobby.id, 'Eve');
    await expect(app.injectWS(url(refused.token), { headers: { origin: ORIGIN } })).rejects.toThrow();
    expect(guestNames.has(refused.guestId)).toBe(false);
    for (const s of [host, ...sockets]) s.terminate();
  });

  it('refuses another origin, a signed-out request and a lobby that is not there', async () => {
    const app = await build();
    apps.push(app);
    const lobby = await open(app, 'alice', 'public');
    await expect(app.injectWS(`/api/minigames/lobbies/${lobby.id}/lobby`, { headers: { origin: 'https://evil.example', 'x-test-user': 'alice' } })).rejects.toThrow();
    await expect(app.injectWS(`/api/minigames/lobbies/${lobby.id}/lobby`, { headers: { origin: ORIGIN } })).rejects.toThrow();
    await expect(app.injectWS('/api/minigames/lobbies/nope/lobby', { headers: { origin: ORIGIN, 'x-test-user': 'alice' } })).rejects.toThrow();
  });
});
