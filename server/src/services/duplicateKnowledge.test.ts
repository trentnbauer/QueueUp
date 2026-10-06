import { beforeEach, describe, expect, it, vi } from 'vitest';

const { voteFindMany, dismissalFindMany, verdictFindMany, verdictUpsert, transaction } = vi.hoisted(() => ({
  voteFindMany: vi.fn(),
  dismissalFindMany: vi.fn(),
  verdictFindMany: vi.fn(),
  verdictUpsert: vi.fn((args: unknown) => args),
  transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock('../db/client.js', () => ({
  prisma: {
    duplicateMergeVote: { findMany: voteFindMany },
    duplicateDismissal: { findMany: dismissalFindMany },
    duplicateVerdict: { findMany: verdictFindMany, upsert: verdictUpsert },
    $transaction: transaction,
  },
}));

import { COMMUNITY_MIN_DISMISSALS, COMMUNITY_MIN_USERS, loadDuplicateKnowledge, saveVerdicts, tallyMerges } from './duplicateKnowledge.js';

const vote = (low: number, high: number, keepIgdbId: number) => ({ igdbIdLow: low, igdbIdHigh: high, keepIgdbId });

beforeEach(() => {
  vi.clearAllMocks();
  voteFindMany.mockResolvedValue([]);
  dismissalFindMany.mockResolvedValue([]);
  verdictFindMany.mockResolvedValue([]);
});

describe('tallyMerges', () => {
  it('only counts a pair once enough distinct people merged it, keeping the side most of them kept', () => {
    const rows = [vote(1, 2, 1), vote(1, 2, 1), vote(1, 2, 2), vote(3, 4, 4)];
    const out = tallyMerges(rows);
    expect(out.get('1:2')).toEqual({ users: 3, keepIgdbId: 1 });
    expect(out.has('3:4')).toBe(false);
    expect(COMMUNITY_MIN_USERS).toBe(2);
  });

  it('breaks a tie towards the lower (earlier) igdb id', () => {
    expect(tallyMerges([vote(5, 9, 9), vote(5, 9, 5)]).get('5:9')).toEqual({ users: 2, keepIgdbId: 5 });
  });
});

describe('loadDuplicateKnowledge', () => {
  it('asks only about pairs among this shelf, leaving out the person\'s own votes, and returns the community merges', async () => {
    voteFindMany.mockResolvedValue([vote(1, 2, 2), vote(1, 2, 2)]);
    const k = await loadDuplicateKnowledge('u1', [1, 2, 2, 3]);
    expect(voteFindMany).toHaveBeenCalledWith({ where: { igdbIdLow: { in: [1, 2, 3] }, igdbIdHigh: { in: [1, 2, 3] }, userId: { not: 'u1' } }, select: { igdbIdLow: true, igdbIdHigh: true, keepIgdbId: true } });
    expect(k.merges.get('1:2')).toEqual({ users: 2, keepIgdbId: 2 });
  });

  it('treats a pair enough others dismissed as "not duplicates", unless anyone merged it', async () => {
    dismissalFindMany.mockResolvedValue([
      { igdbIdLow: 1, igdbIdHigh: 2 },
      { igdbIdLow: 1, igdbIdHigh: 2 },
      { igdbIdLow: 3, igdbIdHigh: 4 },
      { igdbIdLow: 3, igdbIdHigh: 4 },
      { igdbIdLow: 5, igdbIdHigh: 6 },
    ]);
    voteFindMany.mockResolvedValue([vote(3, 4, 3)]);
    const k = await loadDuplicateKnowledge('u1', [1, 2, 3, 4, 5, 6]);
    expect(k.notDuplicates).toEqual(new Set(['1:2']));
    expect(COMMUNITY_MIN_DISMISSALS).toBe(2);
  });

  it('ignores any saved "not the same" verdict, since a model leaving a pair out proves nothing', async () => {
    verdictFindMany.mockResolvedValue([
      { igdbIdLow: 1, igdbIdHigh: 2, same: false, keepIgdbId: null, confidence: null, reason: null },
      { igdbIdLow: 3, igdbIdHigh: 4, same: true, keepIgdbId: 3, confidence: 0.9, reason: 'edition' },
    ]);
    const k = await loadDuplicateKnowledge('u1', [1, 2, 3, 4]);
    expect([...k.verdicts.keys()]).toEqual(['3:4']);
  });

  it('returns the AI\'s cached verdicts, only recent ones', async () => {
    const now = Date.parse('2026-10-06T12:00:00Z');
    verdictFindMany.mockResolvedValue([{ igdbIdLow: 1, igdbIdHigh: 2, same: true, keepIgdbId: 1, confidence: 0.9, reason: 'edition' }]);
    const k = await loadDuplicateKnowledge('u1', [1, 2], now);
    expect(k.verdicts.get('1:2')).toEqual({ same: true, keepIgdbId: 1, confidence: 0.9, reason: 'edition' });
    const where = verdictFindMany.mock.calls[0][0].where;
    expect(where.judgedAt.gte).toEqual(new Date(now - 90 * 24 * 60 * 60 * 1000));
  });

  it('does no work for a shelf with fewer than two games', async () => {
    const k = await loadDuplicateKnowledge('u1', [7]);
    expect(k.merges.size + k.notDuplicates.size + k.verdicts.size).toBe(0);
    expect(voteFindMany).not.toHaveBeenCalled();
  });
});

describe('saveVerdicts', () => {
  it('stores each pair once, low id first, and never throws', async () => {
    await saveVerdicts([{ igdbIdA: 9, igdbIdB: 4, same: true, keepIgdbId: 4, confidence: 0.9, reason: 'edition' }]);
    expect(verdictUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { igdbIdLow_igdbIdHigh: { igdbIdLow: 4, igdbIdHigh: 9 } } }));
    transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(saveVerdicts([{ igdbIdA: 1, igdbIdB: 2, same: false }])).resolves.toBeUndefined();
    await saveVerdicts([]);
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
