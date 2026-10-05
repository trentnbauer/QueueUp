import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst, create, deleteMany } = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() }));

vi.mock('../db/client.js', () => ({ prisma: { playLog: { findFirst, create, deleteMany } } }));
vi.mock('./playtimeTracking.js', () => ({ currentPlaytimeMinutesForGame: vi.fn(async () => null) }));

import { recordStatusTransition } from './playLog.js';

beforeEach(() => {
  findFirst.mockReset();
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
