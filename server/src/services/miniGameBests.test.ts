import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ groupBy: vi.fn(), friends: [] as string[], blocked: [] as string[] }));
vi.mock('../db/client.js', () => ({ prisma: { miniGameScore: { groupBy: h.groupBy } } }));
vi.mock('./friendships.js', () => ({ friendIdsOf: vi.fn(async () => h.friends) }));
vi.mock('./blocks.js', () => ({ blockedIdsOf: vi.fn(async () => h.blocked) }));
vi.mock('./notifications.js', () => ({ notifyMiniGameBeaten: vi.fn() }));
vi.mock('./notificationPreferences.js', () => ({ wantsAlert: vi.fn() }));

const { myBests } = await import('./miniGameScores.js');
const row = (userId: string, gameId: string, score: number) => ({ userId, gameId, _max: { score }, _min: { score } });

describe('myBests', () => {
  beforeEach(() => {
    h.groupBy.mockReset();
    h.friends = ['f1', 'f2', 'f3'];
    h.blocked = [];
  });

  /** The first groupBy is the viewer's own bests, the second is their friends'. */
  function answers(mine: ReturnType<typeof row>[], friends: ReturnType<typeof row>[]) {
    h.groupBy.mockResolvedValueOnce(mine).mockResolvedValueOnce(friends);
  }

  it('ranks each best among friends: one more than the friends with a better one, ties sharing a place', async () => {
    answers(
      [row('me', 'runner', 50), row('me', 'flappy', 30), row('me', 'dodge', 10)],
      [row('f1', 'runner', 80), row('f2', 'runner', 50), row('f3', 'runner', 20), row('f1', 'flappy', 10), row('f1', 'dodge', 99), row('f2', 'dodge', 98), row('f3', 'dodge', 97)],
    );
    const { bests, friendRanks } = await myBests('me');
    expect(bests).toMatchObject({ runner: 50, flappy: 30, dodge: 10 });
    expect(friendRanks).toEqual({ runner: 2, flappy: 1, dodge: 4 });
  });

  it('counts a smaller time as better in Quick draw', async () => {
    answers([{ userId: 'me', gameId: 'draw', _max: { score: 400 }, _min: { score: 250 } }], [{ userId: 'f1', gameId: 'draw', _max: { score: 300 }, _min: { score: 300 } }]);
    expect((await myBests('me')).friendRanks).toEqual({ draw: 1 });
  });

  it('puts you first with no friends, and asks the database only once', async () => {
    h.friends = [];
    h.groupBy.mockResolvedValueOnce([row('me', 'runner', 5)]);
    expect((await myBests('me')).friendRanks).toEqual({ runner: 1 });
    expect(h.groupBy).toHaveBeenCalledTimes(1);
  });

  it('leaves out friends you have blocked, and says nothing for a game you have not played', async () => {
    h.blocked = ['f1'];
    answers([row('me', 'runner', 50)], [row('f2', 'runner', 60)]);
    const { friendRanks } = await myBests('me');
    expect(friendRanks).toEqual({ runner: 2 });
    expect(h.groupBy.mock.calls[1][0].where.userId.in).toEqual(['f2', 'f3']);
  });

  it('has no ranks at all before a first run', async () => {
    h.groupBy.mockResolvedValueOnce([]);
    expect(await myBests('me')).toEqual({ bests: {}, friendRanks: {} });
  });
});
