import { beforeEach, describe, expect, it, vi } from 'vitest';

const { gameFindMany, gameUpdateMany, dismissalFindMany, getGameAddonIgdbIds } = vi.hoisted(() => ({ gameFindMany: vi.fn(), gameUpdateMany: vi.fn(), dismissalFindMany: vi.fn(), getGameAddonIgdbIds: vi.fn() }));
vi.mock('../../db/client.js', () => ({ prisma: { game: { findMany: gameFindMany, updateMany: gameUpdateMany }, duplicateDismissal: { findMany: dismissalFindMany } } }));
// IGDB's DLC list for a game, by igdbId (see dropDlcPairs).
vi.mock('../igdbClient.js', () => ({ getGameAddonIgdbIds }));
vi.mock('./aiConfig.js', () => ({ aiComplete: vi.fn() }));
vi.mock('../notifications.js', () => ({ notifyMergeSuggestions: vi.fn() }));
const { loadDuplicateKnowledge } = vi.hoisted(() => ({ loadDuplicateKnowledge: vi.fn() }));
vi.mock('../duplicateKnowledge.js', () => ({ loadDuplicateKnowledge, saveVerdicts: vi.fn() }));

import { countDuplicateCandidates, listDuplicateCandidates } from './aiDuplicates.js';

const game = (id: string, igdbId: number, title: string, releaseYear: number | null) => ({
  id,
  igdbId,
  title,
  platform: 'PC',
  releaseYear,
  coverImageUrl: null,
  status: 'backlog',
  igdbCollectionId: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  dismissalFindMany.mockResolvedValue([]);
  gameUpdateMany.mockResolvedValue({ count: 1 });
  getGameAddonIgdbIds.mockResolvedValue(new Set());
  loadDuplicateKnowledge.mockResolvedValue({ merges: new Map(), notDuplicates: new Set(), verdicts: new Map() });
});

describe('listDuplicateCandidates', () => {
  it('lists the same pairs the count reports, keeping the earlier release, without the collection id', async () => {
    gameFindMany.mockResolvedValue([game('a', 1, 'Witcher 3', 2015), game('b', 2, 'Witcher 3 Complete Edition', 2016), game('c', 3, 'Celeste', 2018)]);
    const list = await listDuplicateCandidates('u1');
    expect(list.pairs.length).toBe(await countDuplicateCandidates('u1'));
    expect(list.pairs).toHaveLength(1);
    const [p] = list.pairs;
    expect([p.a.id, p.b.id].sort()).toEqual(['a', 'b']);
    expect((p.keep === 'a' ? p.a : p.b).id).toBe('a');
    expect('igdbCollectionId' in p.a).toBe(false);
  });

  it('puts pairs other people merged first, keeping the side they kept', async () => {
    gameFindMany.mockResolvedValue([
      game('a', 1, 'Witcher 3', 2015),
      game('b', 2, 'Witcher 3 Complete Edition', 2016),
      game('c', 3, 'Celeste', 2018),
      game('d', 4, 'Celeste Deluxe Edition', 2019),
    ]);
    loadDuplicateKnowledge.mockResolvedValue({ merges: new Map([['3:4', { users: 4, keepIgdbId: 4 }]]), notDuplicates: new Set(), verdicts: new Map() });
    const { pairs } = await listDuplicateCandidates('u1');
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toMatchObject({ communityMergedBy: 4, keep: 'b' });
    expect(pairs[0].b.id).toBe('d');
    expect(pairs[1].communityMergedBy).toBe(0);
  });

  it('leaves out a pair the person dismissed', async () => {
    gameFindMany.mockResolvedValue([game('a', 1, 'Witcher 3', 2015), game('b', 2, 'Witcher 3 Complete Edition', 2016)]);
    dismissalFindMany.mockResolvedValue([{ igdbIdLow: 1, igdbIdHigh: 2 }]);
    expect((await listDuplicateCandidates('u1')).pairs).toEqual([]);
  });

  it('leaves out a game and its DLC, and links the DLC card to its base game', async () => {
    // The titles alone make these a pair; IGDB lists 2 among game 1's DLC and expansions.
    gameFindMany.mockResolvedValue([game('base', 1, 'Cyberpunk 2077', 2020), game('dlc', 2, 'Cyberpunk 2077: Phantom Liberty', 2023), game('c', 3, 'Witcher 3', 2015), game('d', 4, 'Witcher 3 Complete Edition', 2016)]);
    getGameAddonIgdbIds.mockImplementation(async (igdbId: number) => new Set(igdbId === 1 ? [2] : []));
    const { pairs } = await listDuplicateCandidates('u1');
    expect(pairs.map((p) => [p.a.id, p.b.id].sort())).toEqual([['c', 'd']]);
    expect(await countDuplicateCandidates('u1')).toBe(1);
    expect(gameUpdateMany).toHaveBeenCalledWith({ where: { id: 'dlc', roomId: null, addedBy: 'u1', baseGameId: null }, data: { baseGameId: 'base' } });
  });

  it('still lists the pair when IGDB cannot be reached', async () => {
    gameFindMany.mockResolvedValue([game('base', 1, 'Cyberpunk 2077', 2020), game('dlc', 2, 'Cyberpunk 2077: Phantom Liberty', 2023)]);
    getGameAddonIgdbIds.mockRejectedValue(new Error('IGDB request failed (503)'));
    expect((await listDuplicateCandidates('u1')).pairs).toHaveLength(1);
    expect(gameUpdateMany).not.toHaveBeenCalled();
  });
});
