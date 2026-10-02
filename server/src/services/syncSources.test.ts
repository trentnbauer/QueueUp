import { describe, expect, it, vi } from 'vitest';

const { findMany, createMany } = vi.hoisted(() => ({ findMany: vi.fn(), createMany: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { gameSyncSource: { findMany, createMany } } }));

import { getSyncSources, recordSyncSources } from './syncSources.js';

describe('getSyncSources', () => {
  it('returns sources in a fixed order for the viewer\'s own shelf games only', async () => {
    findMany.mockResolvedValueOnce([
      { igdbId: 1, source: 'playnite' },
      { igdbId: 1, source: 'steam' },
    ]);
    const map = await getSyncSources(
      [
        { id: 'g1', igdbId: 1, roomId: null, addedBy: 'me' },
        { id: 'g2', igdbId: 2, roomId: null, addedBy: 'me' },
        { id: 'g3', igdbId: 1, roomId: 'r', addedBy: 'me' },
        { id: 'g4', igdbId: 1, roomId: null, addedBy: 'other' },
      ],
      'me',
    );
    expect(map.get('g1')).toEqual(['steam', 'playnite']);
    expect(map.has('g2')).toBe(false);
    expect(map.has('g3')).toBe(false);
    expect(map.has('g4')).toBe(false);
  });

  it('skips the query when there are no shelf games', async () => {
    findMany.mockClear();
    await getSyncSources([{ id: 'g', igdbId: 1, roomId: 'r', addedBy: 'me' }], 'me');
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('recordSyncSources', () => {
  it('writes each title once and does nothing for an empty list', async () => {
    await recordSyncSources('me', [], 'steam');
    expect(createMany).not.toHaveBeenCalled();
    await recordSyncSources('me', [5, 5, 6], 'steam');
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'me', igdbId: 5, source: 'steam' },
        { userId: 'me', igdbId: 6, source: 'steam' },
      ],
      skipDuplicates: true,
    });
  });
});
