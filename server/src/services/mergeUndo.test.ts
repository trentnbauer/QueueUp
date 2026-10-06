import { beforeEach, describe, expect, it, vi } from 'vitest';

const r = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('./redisClient.js', () => ({ redis: r }));

import { UNDO_TTL_SECONDS, dropUndo, saveUndo, takeUndo, type RematchUndo } from './mergeUndo.js';

const undo: RematchUndo = { kind: 'rematch', userId: 'u1', roomId: null, ownerId: 'u1', gameId: 'g1', before: { id: 'g1' }, redirects: null };
const TOKEN = '123e4567-e89b-12d3-a456-426614174000';

beforeEach(() => vi.clearAllMocks());

describe('undo tokens', () => {
  it('keeps a snapshot for a few minutes under a random token', async () => {
    const token = await saveUndo(undo);
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.set).toHaveBeenCalledWith(`undo:game-change:${token}`, JSON.stringify(undo), 'EX', UNDO_TTL_SECONDS);
    expect(UNDO_TTL_SECONDS).toBe(600);
  });

  it('hands the snapshot back to the person who made the change', async () => {
    r.get.mockResolvedValue(JSON.stringify(undo));
    expect(await takeUndo('u1', TOKEN)).toMatchObject({ kind: 'rematch', gameId: 'g1' });
  });

  it('refuses someone else, an expired token and something that is not a token', async () => {
    r.get.mockResolvedValue(JSON.stringify(undo));
    await expect(takeUndo('u2', TOKEN)).rejects.toMatchObject({ statusCode: 403 });
    r.get.mockResolvedValue(null);
    await expect(takeUndo('u1', TOKEN)).rejects.toMatchObject({ statusCode: 410 });
    await expect(takeUndo('u1', '../../etc')).rejects.toMatchObject({ statusCode: 400 });
    expect(r.get).toHaveBeenCalledTimes(2);
  });

  it('only forgets a token once the undo worked, so a failed attempt can be tried again', async () => {
    r.get.mockResolvedValue(JSON.stringify(undo));
    await takeUndo('u1', TOKEN);
    expect(r.del).not.toHaveBeenCalled();
    await dropUndo(TOKEN);
    expect(r.del).toHaveBeenCalledWith(`undo:game-change:${TOKEN}`);
  });
});
