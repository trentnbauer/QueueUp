import { beforeEach, describe, expect, it, vi } from 'vitest';

const { gameFindMany, dismissalFindMany } = vi.hoisted(() => ({ gameFindMany: vi.fn(), dismissalFindMany: vi.fn() }));
vi.mock('../../db/client.js', () => ({ prisma: { game: { findMany: gameFindMany }, duplicateDismissal: { findMany: dismissalFindMany } } }));
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
});
