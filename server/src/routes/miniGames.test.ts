import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { HttpError } from '../util/httpError.js';

const h = vi.hoisted(() => ({ record: vi.fn(async () => {}), board: vi.fn(async () => ({ rows: [] })), me: vi.fn(async () => ({})) }));

vi.mock('../services/miniGameScores.js', () => ({
  isLobbyGameId: (v: unknown) => typeof v === 'string' && ['runner', 'coins'].includes(v),
  isPlausibleScore: (_g: string, s: unknown) => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 100,
  recordRunScores: h.record,
  leaderboard: h.board,
  myScores: h.me,
}));

import miniGameRoutes from './miniGames.js';

async function build() {
  const app = Fastify();
  app.decorateRequest('requireAuth', async function (this: { headers: Record<string, string | undefined> }) {
    const user = this.headers['x-test-user'];
    if (!user) throw new HttpError(401, 'Not signed in');
    return user;
  } as never);
  app.setErrorHandler((err: unknown, _req, reply) => {
    const e = err as { statusCode?: number; message?: string };
    return reply.status(e.statusCode ?? 500).send({ error: e.message });
  });
  await app.register(miniGameRoutes);
  await app.ready();
  return app;
}

describe('mini game score routes', () => {
  it('saves a plausible solo score for the signed-in person', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/api/minigames/scores', headers: { 'x-test-user': 'u1' }, payload: { game: 'runner', score: 42 } });
    expect(res.statusCode).toBe(204);
    expect(h.record).toHaveBeenCalledWith('runner', 'solo', [{ userId: 'u1', score: 42 }]);
    await app.close();
  });

  it('refuses an impossible score, an unknown game and a signed-out request', async () => {
    const app = await build();
    const headers = { 'x-test-user': 'u1' };
    expect((await app.inject({ method: 'POST', url: '/api/minigames/scores', headers, payload: { game: 'runner', score: 1e9 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/minigames/scores', headers, payload: { game: 'nope', score: 5 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/minigames/scores', payload: { game: 'runner', score: 5 } })).statusCode).toBe(401);
    await app.close();
  });

  it('checks the leaderboard filters', async () => {
    const app = await build();
    const headers = { 'x-test-user': 'u1' };
    expect((await app.inject({ method: 'GET', url: '/api/minigames/scores?game=runner&scope=everyone', headers })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/minigames/scores?game=runner&period=year', headers })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/minigames/scores?game=runner&scope=server&period=week', headers })).statusCode).toBe(200);
    expect(h.board).toHaveBeenCalledWith('u1', 'runner', 'server', 'week');
    await app.close();
  });
});
