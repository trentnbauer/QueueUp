import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Each person's best per game, as the database would answer a groupBy, kept up to date as runs are saved. */
const state = vi.hoisted(() => ({ bests: new Map<string, number>(), friends: new Map<string, string[]>(), blocked: new Map<string, string[]>(), declined: new Set<string>(), lower: false }));
const notify = vi.hoisted(() => vi.fn());

vi.mock('../db/client.js', () => ({
  prisma: {
    miniGameScore: {
      groupBy: vi.fn(async ({ where }: { where: { userId: { in: string[] } } }) =>
        where.userId.in.filter((id) => state.bests.has(id)).map((id) => ({ userId: id, _max: { score: state.bests.get(id) }, _min: { score: state.bests.get(id) } })),
      ),
      createMany: vi.fn(async ({ data }: { data: { userId: string; score: number }[] }) => {
        for (const d of data) {
          const best = state.bests.get(d.userId);
          if (best === undefined || (state.lower ? d.score < best : d.score > best)) state.bests.set(d.userId, d.score);
        }
      }),
    },
    user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ displayName: `Name of ${where.id}` })) },
  },
}));
vi.mock('./friendships.js', () => ({ friendIdsOf: vi.fn(async (id: string) => state.friends.get(id) ?? []) }));
vi.mock('./blocks.js', () => ({ blockedIdsOf: vi.fn(async (id: string) => state.blocked.get(id) ?? []) }));
vi.mock('./notificationPreferences.js', () => ({ wantsAlert: vi.fn(async (id: string) => !state.declined.has(id)) }));
vi.mock('./notifications.js', () => ({ notifyMiniGameBeaten: notify }));

const { recordRunScores } = await import('./miniGameScores.js');
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('telling a friend their mini game high score was beaten', () => {
  beforeEach(() => {
    state.bests = new Map([['friend', 50]]);
    state.friends = new Map([['me', ['friend']], ['friend', ['me']]]);
    state.blocked = new Map();
    state.declined = new Set();
    state.lower = false;
    notify.mockReset();
  });

  it('tells a friend whose best a new run beats, naming the game and both scores', async () => {
    await recordRunScores('runner', 'solo', [{ userId: 'me', score: 80 }]);
    await settle();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('friend', 'me', 'runner', 'Name of me beat your Runner high score: 80 to your 50');
  });

  it('says nothing when the run does not beat them, or only ties', async () => {
    await recordRunScores('runner', 'solo', [{ userId: 'me', score: 50 }]);
    await recordRunScores('runner', 'solo', [{ userId: 'me', score: 20 }]);
    await settle();
    expect(notify).not.toHaveBeenCalled();
  });

  it('says it once: a later run that was already ahead of them stays quiet', async () => {
    await recordRunScores('runner', 'solo', [{ userId: 'me', score: 80 }]);
    await recordRunScores('runner', 'solo', [{ userId: 'me', score: 90 }]);
    await settle();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('tells them again after they take the lead back and are passed again', async () => {
    await recordRunScores('runner', 'solo', [{ userId: 'me', score: 80 }]);
    await settle();
    state.bests.set('friend', 100);
    await recordRunScores('runner', 'solo', [{ userId: 'me', score: 120 }]);
    await settle();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('counts a smaller time as better in a game scored by time', async () => {
    state.lower = true;
    state.bests = new Map([['friend', 300]]);
    await recordRunScores('draw', 'solo', [{ userId: 'me', score: 400 }]);
    await settle();
    expect(notify).not.toHaveBeenCalled();
    await recordRunScores('draw', 'solo', [{ userId: 'me', score: 250 }]);
    await settle();
    expect(notify).toHaveBeenCalledWith('friend', 'me', 'draw', 'Name of me beat your Quick draw high score: 250 ms to your 300 ms');
  });

  it('only tells friends, and not ones who have blocked or been blocked', async () => {
    state.bests.set('stranger', 10);
    state.friends.set('me', ['friend', 'blocked']);
    state.bests.set('blocked', 10);
    state.blocked.set('me', ['blocked']);
    await recordRunScores('runner', 'solo', [{ userId: 'me', score: 80 }]);
    await settle();
    expect(notify.mock.calls.map((c) => c[0])).toEqual(['friend']);
  });

  it('skips a friend with no score of their own yet, and one who turned the alert off', async () => {
    state.friends.set('me', ['friend', 'newbie', 'quiet']);
    state.bests.set('quiet', 5);
    state.declined.add('quiet');
    await recordRunScores('runner', 'solo', [{ userId: 'me', score: 80 }]);
    await settle();
    expect(notify.mock.calls.map((c) => c[0])).toEqual(['friend']);
  });

  it('tells nobody about a run that does not reach the high score lists', async () => {
    await recordRunScores('runner', 'lobby', [{ userId: 'me', score: 80 }], undefined, false);
    await settle();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not tell people who played the same run, who have just seen the result', async () => {
    // Both just played: the friend got 90 in this run, and I got 80, so each knows already.
    await recordRunScores('runner', 'lobby', [{ userId: 'me', score: 80 }, { userId: 'friend', score: 90 }]);
    await settle();
    expect(notify).not.toHaveBeenCalled();
  });
});
