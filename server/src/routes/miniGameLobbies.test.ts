import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { HttpError } from '../util/httpError.js';

const h = vi.hoisted(() => ({
  friends: new Set<string>(),
  blocked: new Set<string>(),
  present: new Map<string, string[]>(),
  closed: [] as string[],
}));

vi.mock('../config/env.js', () => ({ env: { APP_BASE_URL: 'https://queueup.example' } }));
vi.mock('../db/client.js', () => ({
  prisma: {
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, displayName: id.toUpperCase(), avatarColor: '#fff', avatarUrl: null })),
    },
  },
}));
vi.mock('../services/friendships.js', () => ({ areFriends: async (a: string, b: string) => h.friends.has(`${a}:${b}`) }));
vi.mock('../services/blocks.js', () => ({ isBlockedEitherWay: async (a: string, b: string) => h.blocked.has(a) || h.blocked.has(b) }));
vi.mock('../services/miniGameScores.js', () => ({ isLobbyGameId: (v: unknown) => v === 'runner' || v === 'dodge' }));
vi.mock('../services/spinLobbyInstance.js', () => ({
  spinLobbyHub: {
    hasMembers: (key: string) => (h.present.get(key)?.length ?? 0) > 0,
    presentIds: (key: string) => h.present.get(key) ?? [],
    isPresent: (key: string, id: string) => h.present.get(key)?.includes(id) ?? false,
    closeRoom: (key: string) => void h.closed.push(key),
  },
}));

import miniGameLobbyRoutes from './miniGameLobbies.js';
import { openLobbies } from '../services/openLobbies.js';

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
  await app.register(miniGameLobbyRoutes);
  await app.ready();
  return app;
}

const as = (user: string) => ({ 'x-test-user': user });

beforeEach(() => {
  h.friends.clear();
  h.blocked.clear();
  h.present.clear();
  h.closed.length = 0;
  for (const l of openLobbies.all()) openLobbies.close(l.id);
});

describe('open lobby routes', () => {
  it('opens a lobby; only an invite-code one has a code, and only its host sees it', async () => {
    const app = await build();
    const pub = await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('host'), payload: { visibility: 'public', game: null } });
    expect(pub.json()).toMatchObject({ visibility: 'public', mine: true, code: null, game: null, timeLimit: false });
    const priv = (await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('other'), payload: { visibility: 'code', game: 'runner' } })).json();
    expect(priv.code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    expect(priv.game).toBe('runner');
    const seenByOther = (await app.inject({ method: 'GET', url: `/api/minigames/lobbies/${priv.id}`, headers: as('other') })).json();
    expect(seenByOther.code).toBe(priv.code);
    await app.close();
  });

  it('refuses a bad visibility or game', async () => {
    const app = await build();
    expect((await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('h'), payload: { visibility: 'everyone', game: null } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('h'), payload: { visibility: 'public', game: 'nope' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/minigames/lobbies', payload: { visibility: 'public', game: null } })).statusCode).toBe(401);
    await app.close();
  });

  it('lists a lobby to others once someone is in it, by who may join', async () => {
    const app = await build();
    const pub = (await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('host'), payload: { visibility: 'public', game: null } })).json();
    const mates = (await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('pal'), payload: { visibility: 'friends', game: null } })).json();
    const list = async (user: string) => (await app.inject({ method: 'GET', url: '/api/minigames/lobbies', headers: as(user) })).json().lobbies.map((l: { id: string }) => l.id);

    // Nobody is in either yet: others see nothing, hosts see their own.
    expect(await list('stranger')).toEqual([]);
    expect(await list('host')).toEqual([pub.id]);

    h.present.set(`lobby:${pub.id}`, ['host']);
    h.present.set(`lobby:${mates.id}`, ['pal']);
    expect(await list('stranger')).toEqual([pub.id]);
    h.friends.add('buddy:pal');
    expect(await list('stranger')).toEqual([pub.id]);
    expect((await list('buddy')).sort()).toEqual([pub.id, mates.id].sort());
    await app.close();
  });

  it('hides a lobby from someone who has blocked or been blocked by its host', async () => {
    const app = await build();
    const pub = (await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('host'), payload: { visibility: 'public', game: null } })).json();
    h.present.set(`lobby:${pub.id}`, ['host']);
    h.blocked.add('troll');
    expect((await app.inject({ method: 'GET', url: '/api/minigames/lobbies', headers: as('troll') })).json().lobbies).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/api/minigames/lobbies/${pub.id}`, headers: as('troll') })).statusCode).toBe(404);
    await app.close();
  });

  it('lets people into an invite-code lobby only with its code', async () => {
    const app = await build();
    const made = (await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('host'), payload: { visibility: 'code', game: null } })).json();
    const url = `/api/minigames/lobbies/${made.id}`;
    // Not listed, and not openable by id.
    expect((await app.inject({ method: 'GET', url, headers: as('guest') })).statusCode).toBe(404);
    // The code only works while someone is in the lobby.
    expect((await app.inject({ method: 'POST', url: '/api/minigames/lobbies/join', headers: as('guest'), payload: { code: made.code } })).statusCode).toBe(404);
    h.present.set(`lobby:${made.id}`, ['host']);
    expect((await app.inject({ method: 'POST', url: '/api/minigames/lobbies/join', headers: as('guest'), payload: { code: 'nonsense' } })).statusCode).toBe(404);
    const joined = await app.inject({ method: 'POST', url: '/api/minigames/lobbies/join', headers: as('guest'), payload: { code: `https://x.test/games?code=${made.code.toLowerCase()}` } });
    expect(joined.statusCode).toBe(200);
    expect(joined.json().code).toBeNull();
    expect((await app.inject({ method: 'GET', url, headers: as('guest') })).statusCode).toBe(200);
    await app.close();
  });

  it('opens a lobby with the 30 second time limit on or off, off unless asked', async () => {
    const app = await build();
    const on = await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('host'), payload: { visibility: 'public', game: null, timeLimit: true } });
    expect(on.json().timeLimit).toBe(true);
    expect(openLobbies.get(on.json().id)?.timeLimit).toBe(true);
    const off = await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('other'), payload: { visibility: 'public', game: null, timeLimit: 'yes' } });
    expect(off.json().timeLimit).toBe(false);
  });

  it('lets only the host close a lobby, and closing it ends its connections', async () => {
    const app = await build();
    const made = (await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('host'), payload: { visibility: 'public', game: null } })).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/minigames/lobbies/${made.id}`, headers: as('guest') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/minigames/lobbies/${made.id}`, headers: as('host') })).statusCode).toBe(204);
    expect(h.closed).toEqual([`lobby:${made.id}`]);
    expect(openLobbies.get(made.id)).toBeUndefined();
    await app.close();
  });

  it('closes the lobby someone was hosting when they open another', async () => {
    const app = await build();
    const first = (await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('host'), payload: { visibility: 'public', game: null } })).json();
    await app.inject({ method: 'POST', url: '/api/minigames/lobbies', headers: as('host'), payload: { visibility: 'friends', game: null } });
    expect(h.closed).toEqual([`lobby:${first.id}`]);
    expect(openLobbies.all()).toHaveLength(1);
    await app.close();
  });
});
