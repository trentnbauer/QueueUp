import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  createGameForUser: vi.fn(),
  unionOwnershipPlatforms: vi.fn(),
}));
vi.mock('../db/client.js', () => ({ prisma: { game: { findFirst: m.findFirst } } }));
vi.mock('./gameIntake.js', () => ({ createGameForUser: m.createGameForUser }));
vi.mock('./gameOwnership.js', () => ({ unionOwnershipPlatforms: m.unionOwnershipPlatforms }));
vi.mock('./syncSources.js', () => ({ recordSyncSources: vi.fn() }));
vi.mock('./playniteImport.js', () => ({
  deletePendingLibraryImport: vi.fn(),
  recordTitleMatchAlias: vi.fn(),
  recordTitleMatchSuggestion: vi.fn(),
  userAliasSource: (s: string, u: string) => `${s}:user:${u}`,
}));

import { addResolvedGame, isSyncSource } from './pendingImportResolve.js';

beforeEach(() => vi.clearAllMocks());

describe('addResolvedGame', () => {
  it('puts a library title on the shelf as owned on its platforms', async () => {
    m.findFirst.mockResolvedValue(null);
    await addResolvedGame('u1', { platforms: ['pc'], source: 'steam' }, 42);
    expect(m.createGameForUser).toHaveBeenCalledWith('u1', null, 42, { status: 'backlog', ownedPlatforms: ['pc'] });
  });

  it('puts a Steam wishlist title on the Wishlist, not owned', async () => {
    m.findFirst.mockResolvedValue(null);
    await addResolvedGame('u1', { platforms: ['pc'], source: 'steam_wishlist' }, 42);
    expect(m.createGameForUser).toHaveBeenCalledWith('u1', null, 42, { status: 'wishlist' });
    expect(m.unionOwnershipPlatforms).not.toHaveBeenCalled();
  });

  it('leaves a wishlist title alone when the game is already on the shelf', async () => {
    m.findFirst.mockResolvedValue({ id: 'g1', status: 'backlog' });
    await addResolvedGame('u1', { platforms: ['pc'], source: 'steam_wishlist' }, 42);
    expect(m.createGameForUser).not.toHaveBeenCalled();
    expect(m.unionOwnershipPlatforms).not.toHaveBeenCalled();
  });
});

describe('isSyncSource', () => {
  it('knows the Steam sources, so a resolved title is recorded as synced from Steam', () => {
    expect(isSyncSource('steam')).toBe(true);
    expect(isSyncSource('steam_wishlist')).toBe(true);
    expect(isSyncSource('nope')).toBe(false);
  });
});
