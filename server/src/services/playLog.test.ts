import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst, findMany, updateMany, create, deleteMany } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('../db/client.js', () => ({ prisma: { playLog: { findFirst, findMany, updateMany, create, deleteMany } } }));
vi.mock('./playtimeTracking.js', () => ({ currentPlaytimeMinutesForGame: vi.fn(async () => null) }));

import { recordStatusTransition } from './playLog.js';

beforeEach(() => {
  findFirst.mockReset();
  findMany.mockReset();
  updateMany.mockReset();
  create.mockReset();
  deleteMany.mockReset();
});

describe('recordStatusTransition - leaving Playing for the queue', () => {
  it.each([
    ['playing', 'backlog'],
    ['playing', 'play_next'],
    ['playing', 'wishlist'],
    ['paused', 'backlog'],
  ] as const)('discards the open entry on %s -> %s', async (from, to) => {
    expect(await recordStatusTransition('g1', from, to)).toEqual([]);
    expect(deleteMany).toHaveBeenCalledWith({ where: { gameId: 'g1', finishedAt: null } });
  });

  it('keeps the entry open for Playing -> Paused', async () => {
    await recordStatusTransition('g1', 'playing', 'paused');
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('leaves non-playing sources alone (e.g. backlog -> wishlist)', async () => {
    await recordStatusTransition('g1', 'backlog', 'wishlist');
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('recordStatusTransition - how an entry ended', () => {
  const open = [{ id: 'e1', startedAt: new Date('2026-09-01T00:00:00Z') }];

  it.each(['done', 'dropped', 'wont_play'] as const)('records %s on the entries it closes', async (to) => {
    findMany.mockResolvedValue(open);
    await recordStatusTransition('g1', 'playing', to);
    expect(updateMany).toHaveBeenCalledWith({ where: { gameId: 'g1', finishedAt: null }, data: expect.objectContaining({ finishedAs: to }) });
  });

  it.each(['done', 'dropped'] as const)('records %s on the entry made when a game jumps straight there', async (to) => {
    findMany.mockResolvedValue([]);
    create.mockResolvedValue({ id: 'e2', startedAt: new Date() });
    await recordStatusTransition('g1', 'backlog', to);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ finishedAs: to }) });
  });
});
