import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ create: vi.fn(async () => ({ id: 'new-game', status: 'backlog' })), resolve: vi.fn(), ownedStatus: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { game: { create: h.create } } }));
vi.mock('./gameIntake.js', () => ({ resolveGameForCreation: h.resolve, defaultOwnedStatusForRelease: h.ownedStatus, linkDlcToBaseGame: vi.fn() }));
vi.mock('./igdbClient.js', () => ({ isAddonCategory: () => false }));
vi.mock('./gameOwnership.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./gameOwnership.js')>()),
  promoteOwnedWishlistGames: vi.fn(async () => 0),
  setOwnershipPlatforms: vi.fn(),
  unionOwnershipPlatforms: vi.fn(),
}));

import { applyResolvedIgdbEntry } from './libraryImportShelf.js';

const entry = { title: 'Hades', platforms: ['pc' as const] };
const created = () => (h.create.mock.calls[0] as unknown as [{ data: { status: string; purchasedAt: Date | null } }])[0].data;

beforeEach(() => {
  vi.clearAllMocks();
  h.resolve.mockResolvedValue({ title: 'Hades', releaseDate: new Date('2020-01-01') });
  h.ownedStatus.mockReturnValue('backlog');
});

describe('applyResolvedIgdbEntry: a new game found by a sync', () => {
  it('arrives in the Backlog stamped as new, so it shows at the top of the queue', async () => {
    await applyResolvedIgdbEntry('u1', 7, entry, new Map());
    expect(created().status).toBe('backlog');
    expect(created().purchasedAt).toBeInstanceOf(Date);
  });

  it('is not stamped on a first sync from a source, which brings in the whole library at once', async () => {
    await applyResolvedIgdbEntry('u1', 7, entry, new Map(), false);
    expect(created().purchasedAt).toBeNull();
  });

  it('is not stamped when it is not out yet and so becomes a pre-order, not a Backlog game', async () => {
    h.ownedStatus.mockReturnValue('preordered');
    await applyResolvedIgdbEntry('u1', 7, entry, new Map());
    expect(created()).toMatchObject({ status: 'preordered', purchasedAt: null });
  });

  it('creates nothing for a game already on the shelf', async () => {
    await applyResolvedIgdbEntry('u1', 7, entry, new Map([[7, { id: 'old', status: 'backlog' as const }]]));
    expect(h.create).not.toHaveBeenCalled();
  });
});
