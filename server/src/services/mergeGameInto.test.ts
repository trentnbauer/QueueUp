import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
vi.mock('../db/client.js', () => ({ prisma: { game: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));

import { mergeGameInto } from './gameIntake.js';

const game = { id: 'g1', roomId: null, addedBy: 'u1', igdbId: 10, title: 'Witcher 3', coverImageUrl: null };

describe('mergeGameInto (issue #848)', () => {
  beforeEach(() => findFirst.mockReset());

  it('refuses to merge a card into itself', async () => {
    await expect(mergeGameInto('u1', game, 'g1')).rejects.toMatchObject({ statusCode: 400 });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('only looks for the target on the same personal shelf', async () => {
    findFirst.mockResolvedValue(null);
    await expect(mergeGameInto('u1', game, 'g2')).rejects.toMatchObject({ statusCode: 404 });
    expect(findFirst).toHaveBeenCalledWith({ where: { roomId: null, addedBy: 'u1', id: 'g2' } });
  });

  it('only looks for the target in the same room for a room game', async () => {
    findFirst.mockResolvedValue(null);
    await expect(mergeGameInto('u1', { ...game, roomId: 'r1' }, 'g2')).rejects.toMatchObject({ statusCode: 404 });
    expect(findFirst).toHaveBeenCalledWith({ where: { roomId: 'r1', id: 'g2' } });
  });
});
