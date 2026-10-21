import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  findMany: vi.fn(),
  invalidate: vi.fn(),
  unlockBadges: vi.fn(),
  recordSyncSources: vi.fn(),
  unionOwnedPlatforms: vi.fn(),
  applyResolved: vi.fn(),
  applyRedirect: vi.fn(),
  resolveTitle: vi.fn(),
  recordPending: vi.fn(),
  deletePending: vi.fn(),
  notifyError: vi.fn(),
  notifyAdded: vi.fn(),
  hasSynced: vi.fn(async () => true),
  recordSuggestion: vi.fn(),
}));

vi.mock('../db/client.js', () => ({ prisma: { game: { findMany: h.findMany } } }));
vi.mock('./redisClient.js', () => ({
  redis: {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && h.store.has(key)) return null;
      h.store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => h.store.get(key) ?? null),
    del: vi.fn(async (key: string) => void h.store.delete(key)),
    expire: vi.fn(async () => 1),
  },
}));
vi.mock('./gameAccess.js', () => ({ invalidateExistingIgdbIds: h.invalidate }));
vi.mock('./notifications.js', () => ({ notifyLibrarySyncError: h.notifyError, notifyLibraryGamesAdded: h.notifyAdded }));
vi.mock('./playniteCompletionSuggestions.js', () => ({ recordPlayniteCompletionSuggestion: h.recordSuggestion }));
vi.mock('./badges.js', () => ({ unlockBadges: h.unlockBadges }));
vi.mock('./syncSources.js', () => ({ recordSyncSources: h.recordSyncSources, hasSyncedBefore: h.hasSynced }));
vi.mock('./userSettings.js', () => ({ unionOwnedPlatforms: h.unionOwnedPlatforms }));
vi.mock('./libraryImportShelf.js', () => ({ applyResolvedIgdbEntry: h.applyResolved }));
vi.mock('./matchRedirects.js', () => ({ applyMatchRedirect: h.applyRedirect }));
vi.mock('./playniteImport.js', () => ({
  resolveTitleToIgdbId: h.resolveTitle,
  recordPendingLibraryImport: h.recordPending,
  deletePendingLibraryImportByTitle: h.deletePending,
}));

import { getLibrarySyncProgress, startLibrarySync, withTokenRefreshLock } from './librarySync.js';

const XBOX = { source: 'xbox', syncSource: 'xbox' as const, label: 'Your Xbox sync' };
const logger = { warn: vi.fn(), error: vi.fn() } as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.store.clear();
  h.findMany.mockResolvedValue([]);
  h.unlockBadges.mockResolvedValue([]);
  h.applyRedirect.mockImplementation(async (_u: string, id: number) => id);
  h.applyResolved.mockResolvedValue({ id: 'shelf-1', status: 'backlog' });
  h.hasSynced.mockResolvedValue(true);
  h.invalidate.mockResolvedValue(undefined);
});

const finished = (userId: string) => vi.waitFor(async () => expect((await getLibrarySyncProgress('xbox', userId))?.done).toBe(true));

describe('startLibrarySync', () => {
  it('matches titles onto the shelf, queues the rest, and records what it saw', async () => {
    h.resolveTitle.mockImplementation(async (_s: string, title: string) => ({ Halo: 10, Forza: 20 })[title] ?? null);
    const entries = [
      { title: 'Halo', platforms: ['xbox_one' as const] },
      { title: 'Forza', platforms: ['xbox_series' as const] },
      { title: 'Mystery Game', platforms: ['xbox_360' as const] },
    ];
    expect(await startLibrarySync('u1', XBOX, entries, logger)).toEqual({ consideredCount: 3 });
    await finished('u1');

    const progress = await getLibrarySyncProgress('xbox', 'u1');
    expect(progress).toMatchObject({ consideredCount: 3, matched: 2, unmatched: 1, errored: 0, done: true });
    expect(h.recordPending).toHaveBeenCalledWith('u1', 'xbox', 'Mystery Game', ['xbox_360']);
    expect(h.recordSyncSources).toHaveBeenCalledWith('u1', expect.arrayContaining([10, 20]), 'xbox');
    expect(h.unionOwnedPlatforms).toHaveBeenCalledWith('u1', expect.arrayContaining(['xbox_one', 'xbox_series']), 'Your Xbox sync');
    expect(h.invalidate).toHaveBeenCalledWith(null, 'u1');
    expect(h.deletePending).toHaveBeenCalledWith('u1', 'xbox', 'Halo');
  });

  it('follows a merge redirect instead of re-creating the merged game', async () => {
    h.resolveTitle.mockResolvedValue(10);
    h.applyRedirect.mockResolvedValue(99);
    await startLibrarySync('u1', XBOX, [{ title: 'Halo', platforms: ['xbox_one'] }], logger);
    await finished('u1');
    expect(h.applyResolved).toHaveBeenCalledWith('u1', 99, expect.anything(), expect.any(Map), true);
    expect(h.recordSyncSources).toHaveBeenCalledWith('u1', [99], 'xbox');
  });

  it('counts a failing title as errored without stopping the rest', async () => {
    h.resolveTitle.mockResolvedValue(10);
    h.applyResolved.mockRejectedValueOnce(new Error('igdb down')).mockResolvedValue(undefined);
    await startLibrarySync('u1', XBOX, [{ title: 'A', platforms: ['xbox_one'] }, { title: 'B', platforms: ['xbox_one'] }], logger);
    await finished('u1');
    expect(await getLibrarySyncProgress('xbox', 'u1')).toMatchObject({ matched: 1, errored: 1, done: true });
  });

  it('refuses a second sync while one is running, and frees the lock when it ends', async () => {
    let release!: () => void;
    h.resolveTitle.mockImplementation(() => new Promise((resolve) => (release = () => resolve(null))));
    await startLibrarySync('u1', XBOX, [{ title: 'Slow', platforms: ['xbox_one'] }], logger);
    await expect(startLibrarySync('u1', XBOX, [], logger)).rejects.toMatchObject({ statusCode: 409 });
    release();
    await finished('u1');
    await vi.waitFor(() => expect(h.store.has('library-sync-lock:xbox:u1')).toBe(false));
    await expect(startLibrarySync('u1', XBOX, [], logger)).resolves.toEqual({ consideredCount: 0 });
  });

  it('keeps one person\'s sync separate from another\'s', async () => {
    h.resolveTitle.mockResolvedValue(null);
    await startLibrarySync('u1', XBOX, [], logger);
    await expect(startLibrarySync('u2', XBOX, [], logger)).resolves.toBeDefined();
  });
});

describe('a sync that breaks part-way', () => {
  it('tells the person, naming the store, and still finishes and frees the lock', async () => {
    h.resolveTitle.mockResolvedValue(null);
    h.invalidate.mockRejectedValue(new Error('redis down'));
    h.applyResolved.mockResolvedValue(undefined);
    h.resolveTitle.mockResolvedValue(10); // a match, so the post-run bookkeeping (which fails) runs
    await startLibrarySync('u1', XBOX, [{ title: 'Halo', platforms: ['xbox_one'] }], logger);
    await finished('u1');
    await vi.waitFor(() => expect(h.notifyError).toHaveBeenCalledWith('u1', 'Xbox', expect.stringContaining('went wrong')));
    await vi.waitFor(() => expect(h.store.has('library-sync-lock:xbox:u1')).toBe(false));
  });
});

describe('a store that says a game is finished', () => {
  it('suggests marking it Beaten, and only for the finished ones', async () => {
    h.resolveTitle.mockImplementation(async (_s: string, title: string) => ({ Tetris: 1, Metroid: 2 })[title] ?? null);
    h.applyResolved.mockImplementation(async (_u: string, igdbId: number) => ({ id: `shelf-${igdbId}`, status: 'backlog' }));
    await startLibrarySync('u1', XBOX, [{ title: 'Tetris', platforms: ['gb'], isCompleted: true }, { title: 'Metroid', platforms: ['nes'] }], logger);
    await finished('u1');
    expect(h.recordSuggestion).toHaveBeenCalledTimes(1);
    expect(h.recordSuggestion).toHaveBeenCalledWith('u1', 'shelf-1', 'backlog');
  });

  it('still counts the game as matched when the suggestion cannot be written', async () => {
    h.resolveTitle.mockResolvedValue(1);
    h.recordSuggestion.mockRejectedValue(new Error('db hiccup'));
    await startLibrarySync('u1', XBOX, [{ title: 'Tetris', platforms: ['gb'], isCompleted: true }], logger);
    await finished('u1');
    expect(await getLibrarySyncProgress('xbox', 'u1')).toMatchObject({ matched: 1, errored: 0, done: true });
  });
});

describe('telling the person what a sync added', () => {
  // A new game lands in the map the sync passes to applyResolvedIgdbEntry; one already on the shelf is there from the start.
  const addsToShelf = () =>
    h.applyResolved.mockImplementation(async (_u: string, igdbId: number, _e: unknown, shelf: Map<number, { id: string; status: string }>) => {
      const game = shelf.get(igdbId) ?? { id: `shelf-${igdbId}`, status: 'backlog' };
      shelf.set(igdbId, game);
      return game;
    });
  const sync = async () => {
    h.resolveTitle.mockImplementation(async (_s: string, title: string) => ({ Halo: 10, Forza: 20 })[title] ?? null);
    h.findMany.mockResolvedValue([{ id: 'old-20', igdbId: 20, status: 'backlog' }]);
    await startLibrarySync('u1', XBOX, [{ title: 'Halo', platforms: ['xbox_one'] }, { title: 'Forza', platforms: ['xbox_one'] }], logger);
    await finished('u1');
  };

  it('notifies for the games it created, not the ones already on the shelf', async () => {
    addsToShelf();
    await sync();
    await vi.waitFor(() => expect(h.notifyAdded).toHaveBeenCalledWith('u1', ['shelf-10'], 'Your Xbox sync'));
  });

  it('says nothing on the first sync from a source', async () => {
    addsToShelf();
    h.hasSynced.mockResolvedValue(false);
    await sync();
    expect(h.notifyAdded).not.toHaveBeenCalled();
  });
});

describe('withTokenRefreshLock', () => {
  it('refuses an overlapping call for the same person, and lets the next one in once it ends', async () => {
    let release!: () => void;
    const first = withTokenRefreshLock('xbox', 'u1', () => new Promise<string>((resolve) => (release = () => resolve('done'))));
    await expect(withTokenRefreshLock('xbox', 'u1', async () => 'second')).rejects.toMatchObject({ statusCode: 409 });
    await expect(withTokenRefreshLock('xbox', 'u2', async () => 'other person')).resolves.toBe('other person');
    release();
    await expect(first).resolves.toBe('done');
    await expect(withTokenRefreshLock('xbox', 'u1', async () => 'after')).resolves.toBe('after');
  });

  it('frees the lock when the work throws', async () => {
    await expect(withTokenRefreshLock('psn', 'u1', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(withTokenRefreshLock('psn', 'u1', async () => 'again')).resolves.toBe('again');
  });
});
