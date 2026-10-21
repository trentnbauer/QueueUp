import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ findMany: vi.fn(), createMany: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { game: { findMany: h.findMany }, notification: { createMany: h.createMany } } }));

import { notifyLibraryGamesAdded } from './notifications.js';

const rows = () => (h.createMany.mock.calls[0] as unknown as [{ data: { gameId?: string; message: string; type: string }[] }])[0].data;

beforeEach(() => {
  vi.clearAllMocks();
  h.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, title: `Game ${id}` })));
});

describe('notifyLibraryGamesAdded', () => {
  it('writes one notification per game, tied to the game so the bell opens its card', async () => {
    await notifyLibraryGamesAdded('u1', ['a', 'b'], 'Your Xbox sync');
    expect(rows()).toEqual([
      expect.objectContaining({ gameId: 'a', type: 'library_game_added', message: 'Your Xbox sync added Game a to your shelf.' }),
      expect.objectContaining({ gameId: 'b' }),
    ]);
  });

  it('folds a big batch into a summary row instead of flooding the bell', async () => {
    await notifyLibraryGamesAdded('u1', Array.from({ length: 13 }, (_, i) => `g${i}`), 'Your Xbox sync');
    expect(rows()).toHaveLength(11);
    expect(rows()[10]).toMatchObject({ message: 'Your Xbox sync added 3 more games to your shelf.' });
    expect(rows()[10]?.gameId).toBeUndefined();
  });

  it('writes nothing when the sync added nothing', async () => {
    await notifyLibraryGamesAdded('u1', [], 'Your Xbox sync');
    expect(h.createMany).not.toHaveBeenCalled();
  });
});
