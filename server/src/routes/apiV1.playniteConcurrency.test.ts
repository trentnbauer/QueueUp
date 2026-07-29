import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LibraryImportEntry } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { applyResolvedIgdbEntry } from './apiV1.js';

// resolveGameForCreation is IGDB-backed (network call) - stubbed here so this test doesn't depend
// on live IGDB credentials/availability. Everything else (prisma.game.create, GameOwnership
// upserts) hits the real dev Postgres, same as this repo's other DB-touching verification. An
// artificial delay widens the race window between the two concurrent calls below, exercising the
// P2002 collision path added in applyResolvedIgdbEntry for issue #465 (bounded concurrency means
// two entries in one batch can now resolve to the same igdbId and both reach prisma.game.create
// before either lands - the games_shelf_igdb_unique partial index from issue #326 is what actually
// stops the duplicate row; this proves the loser's P2002 is handled gracefully instead of erroring).
vi.mock('../services/gameIntake.js', () => ({
  resolveGameForCreation: vi.fn(async (igdbId: number) => {
    await new Promise((r) => setTimeout(r, 20));
    return {
      title: `Test Game ${igdbId}`,
      platform: 'PC',
      genre: null,
      ggDealsUrl: null,
      coverImageUrl: null,
      steamAppId: null,
      maxCoopPlayers: null,
      releaseYear: null,
      releaseDate: null,
      timeToBeatHours: null,
      timeToBeatRushedHours: null,
      timeToBeatCompletionistHours: null,
      igdbCollectionId: null,
      reviewScore: null,
      category: null,
      parentGameIgdbId: null,
    };
  }),
  defaultStatusForRelease: () => 'backlog',
  linkDlcToBaseGame: vi.fn(),
}));

const TEST_IGDB_ID = -900001; // negative so it can never collide with a real IGDB id
let userId: string;

describe('applyResolvedIgdbEntry concurrency (issue #465)', () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        oidcSub: `test:apiV1-concurrency-${Date.now()}`,
        email: `apiv1-concurrency-${Date.now()}@test.invalid`,
        displayName: 'apiV1 concurrency test user',
        avatarColor: '#000000',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.gameOwnership.deleteMany({ where: { userId } });
    await prisma.game.deleteMany({ where: { addedBy: userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates exactly one game when two entries in the same batch race on the same igdbId', async () => {
    const existingByIgdbId = new Map<number, { status: string }>();
    const entryA: LibraryImportEntry = { title: 'Test Game A', platforms: ['pc'] };
    const entryB: LibraryImportEntry = { title: 'Test Game B', platforms: ['switch'] };

    await Promise.all([
      applyResolvedIgdbEntry(userId, TEST_IGDB_ID, entryA, existingByIgdbId),
      applyResolvedIgdbEntry(userId, TEST_IGDB_ID, entryB, existingByIgdbId),
    ]);

    const games = await prisma.game.findMany({ where: { addedBy: userId, igdbId: TEST_IGDB_ID } });
    expect(games).toHaveLength(1);

    const ownership = await prisma.gameOwnership.findUnique({ where: { userId_igdbId: { userId, igdbId: TEST_IGDB_ID } } });
    expect(ownership?.platforms.sort()).toEqual(['pc', 'switch']);
  });
});
