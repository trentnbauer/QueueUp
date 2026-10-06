import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), searchGames: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { pendingLibraryImport: { findUnique: m.findUnique, upsert: m.upsert } } }));
vi.mock('./igdbClient.js', () => ({
  searchGames: m.searchGames,
  findIgdbIdByExactTitle: vi.fn(),
  normalizeGameTitleForComparison: (t: string) => t.toLowerCase(),
}));

import { recordPendingLibraryImport } from './playniteImport.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.searchGames.mockResolvedValue({ results: [{ igdbId: 1, title: 'Hades' }] });
});

describe('recordPendingLibraryImport', () => {
  it('queues a new title with IGDB candidates and says it is waiting', async () => {
    m.findUnique.mockResolvedValue(null);
    expect(await recordPendingLibraryImport('u1', 'steam', 'Hades', ['pc'])).toBe(true);
    expect(m.searchGames).toHaveBeenCalledTimes(1);
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not bring back a title the person dismissed, and says it is not waiting', async () => {
    m.findUnique.mockResolvedValue({ dismissedAt: new Date() });
    expect(await recordPendingLibraryImport('u1', 'steam', 'Hades', ['pc'])).toBe(false);
    expect(m.searchGames).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('with refresh off, leaves a title that is already waiting alone instead of searching IGDB again', async () => {
    m.findUnique.mockResolvedValue({ dismissedAt: null });
    expect(await recordPendingLibraryImport('u1', 'steam', 'Hades', ['pc'], { refresh: false })).toBe(true);
    expect(m.searchGames).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('with refresh off, still queues a title that is not waiting yet', async () => {
    m.findUnique.mockResolvedValue(null);
    expect(await recordPendingLibraryImport('u1', 'steam', 'Hades', ['pc'], { refresh: false })).toBe(true);
    expect(m.upsert).toHaveBeenCalledTimes(1);
  });
});
