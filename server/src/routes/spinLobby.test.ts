import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { HttpError } from '../util/httpError.js';

const h = vi.hoisted(() => ({ startSpinNow: vi.fn(async () => {}) }));

vi.mock('../config/env.js', () => ({ env: { APP_BASE_URL: 'https://queueup.example' } }));
vi.mock('../services/roomAccess.js', () => ({
  requireMembership: async (roomId: string, userId: string) => {
    if (roomId !== 'room-1' || userId === 'outsider') throw new HttpError(403, 'Not a member');
    return { role: 'member' };
  },
}));
vi.mock('../services/spinLobbyInstance.js', async () => {
  const { SpinLobbyHub } = await import('../services/spinLobbyHub.js');
  return {
    spinLobbyHub: new SpinLobbyHub(
      { isSpinWaiting: async () => true, extendWaitingRoom: async () => true, startSpinNow: h.startSpinNow },
      { autoTick: false },
    ),
  };
});

import spinLobbyRoutes from './spinLobby.js';
import { spinLobbyHub } from '../services/spinLobbyInstance.js';

async function build() {
  const app = Fastify();
  await app.register(websocket, { options: { maxPayload: 1024 } });
  // Stands in for the real sign-in plugin: the user id comes from a test header.
  app.decorateRequest('requireAuth', async function (this: { headers: Record<string, string | undefined> }) {
    const user = this.headers['x-test-user'];
    if (!user) throw new HttpError(401, 'Not signed in');
    return user;
  } as never);
  app.setErrorHandler((err: unknown, _req, reply) => {
    const e = err as { statusCode?: number; message?: string };
    return reply.status(e.statusCode ?? 500).send({ error: e.message });
  });
  await app.register(spinLobbyRoutes);
  await app.ready();
  return app;
}

const ORIGIN = 'https://queueup.example';
const apps: Awaited<ReturnType<typeof build>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

describe('GET /api/rooms/:roomId/lobby', () => {
  it('lets a member in and puts them in the lobby', async () => {
    const app = await build();
    apps.push(app);
    const ws = await app.injectWS('/api/rooms/room-1/lobby', { headers: { origin: ORIGIN, 'x-test-user': 'alice' } });
    // The welcome snapshot is sent during the upgrade, before the test can listen; the next tick sends another.
    const next = new Promise<{ t: string; game: { players: { id: string }[] } }>((resolve) => ws.once('message', (d: Buffer) => resolve(JSON.parse(d.toString()))));
    await spinLobbyHub.tickRoom('room-1');
    const first = await next;
    expect(first.t).toBe('state');
    expect(first.game.players.map((p) => p.id)).toEqual(['alice']);
    expect(spinLobbyHub.isPresent('room-1', 'alice')).toBe(true);
    ws.terminate();
    await vi.waitFor(() => expect(spinLobbyHub.hasMembers('room-1')).toBe(false));
  });

  it('refuses a request from another origin, or with no origin', async () => {
    const app = await build();
    apps.push(app);
    await expect(app.injectWS('/api/rooms/room-1/lobby', { headers: { origin: 'https://evil.example', 'x-test-user': 'alice' } })).rejects.toThrow();
    await expect(app.injectWS('/api/rooms/room-1/lobby', { headers: { 'x-test-user': 'alice' } })).rejects.toThrow();
    expect(spinLobbyHub.hasMembers('room-1')).toBe(false);
  });

  it('refuses someone who is signed out, or not in the room', async () => {
    const app = await build();
    apps.push(app);
    await expect(app.injectWS('/api/rooms/room-1/lobby', { headers: { origin: ORIGIN } })).rejects.toThrow();
    await expect(app.injectWS('/api/rooms/room-1/lobby', { headers: { origin: ORIGIN, 'x-test-user': 'outsider' } })).rejects.toThrow();
    await expect(app.injectWS('/api/rooms/other-room/lobby', { headers: { origin: ORIGIN, 'x-test-user': 'alice' } })).rejects.toThrow();
  });
});
