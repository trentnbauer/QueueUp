import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const updateMany = vi.fn(async () => ({ count: 2 }));
vi.mock('../db/client.js', () => ({ prisma: { game: { findMany, updateMany } } }));
const checked = new Set<string>();
vi.mock('../services/redisClient.js', () => ({
  redis: { exists: async (k: string) => (checked.has(k) ? 1 : 0), set: async (k: string) => { checked.add(k); return 'OK'; } },
}));
const getGameDetail = vi.fn();
vi.mock('../services/igdbClient.js', () => ({ getGameDetail }));

const { backfillReviewScores } = await import('./reviewScoreBackfillJob.js');

describe('backfillReviewScores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checked.clear();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('fills in a score IGDB has, for every game with that IGDB id', async () => {
    findMany.mockResolvedValue([{ igdbId: 10 }]);
    getGameDetail.mockResolvedValue({ reviewScore: 87 });
    await backfillReviewScores();
    expect(updateMany).toHaveBeenCalledWith({ where: { igdbId: 10, reviewScore: null }, data: { reviewScore: 87 } });
  });

  it("remembers a game IGDB has no score for, and doesn't ask again next run", async () => {
    findMany.mockResolvedValue([{ igdbId: 20 }]);
    getGameDetail.mockResolvedValue({ reviewScore: null });
    await backfillReviewScores();
    await backfillReviewScores();
    expect(getGameDetail).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('retries next run when IGDB fails', async () => {
    findMany.mockResolvedValue([{ igdbId: 30 }]);
    getGameDetail.mockRejectedValueOnce(new Error('502')).mockResolvedValueOnce({ reviewScore: 70 });
    await backfillReviewScores();
    await backfillReviewScores();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
