import { beforeEach, describe, expect, it, vi } from 'vitest';

const gameFindMany = vi.fn();
const userFind = vi.fn();
const notificationFindMany = vi.fn();
const notificationCreate = vi.fn();
const friendIdsOf = vi.fn();
const wantsAlert = vi.fn();

vi.mock('../db/client.js', () => ({
  prisma: {
    game: { findMany: (...a: unknown[]) => gameFindMany(...a) },
    user: { findUnique: (...a: unknown[]) => userFind(...a) },
    notification: { findMany: (...a: unknown[]) => notificationFindMany(...a), create: (...a: unknown[]) => notificationCreate(...a) },
  },
}));
vi.mock('./friendships.js', () => ({ friendIdsOf: (...a: unknown[]) => friendIdsOf(...a) }));
vi.mock('./notificationPreferences.js', () => ({ wantsAlert: (...a: unknown[]) => wantsAlert(...a) }));

const { notifyFriendRecommendation } = await import('./friendRecommendations.js');

const GAME = { id: 'g1', igdbId: 100, title: 'Hades', hiddenFromOthers: false };
const HIGH = { art: 5, gameplay: 4, story: null, sound: null };

describe('notifyFriendRecommendation', () => {
  beforeEach(() => {
    for (const m of [gameFindMany, userFind, notificationFindMany, notificationCreate, friendIdsOf, wantsAlert]) m.mockReset();
    friendIdsOf.mockResolvedValue(['f1', 'f2']);
    gameFindMany.mockResolvedValue([
      { id: 'c1', addedBy: 'f1' },
      { id: 'c2', addedBy: 'f2' },
    ]);
    userFind.mockResolvedValue({ displayName: 'Sam' });
    notificationFindMany.mockResolvedValue([]);
    wantsAlert.mockResolvedValue(true);
  });

  it('tells each friend who has the game on their list, with the score', async () => {
    await notifyFriendRecommendation('me', GAME, HIGH);
    expect(notificationCreate).toHaveBeenCalledTimes(2);
    expect(notificationCreate.mock.calls[0][0].data).toMatchObject({
      recipientId: 'f1',
      actorId: 'me',
      gameId: 'c1',
      type: 'friend_recommendation',
      message: 'Sam rated "Hades" 4.5/5 - it\'s on your list',
    });
  });

  it('only looks at friends\' wishlist, backlog, up next and paused copies', async () => {
    await notifyFriendRecommendation('me', GAME, HIGH);
    const where = gameFindMany.mock.calls[0][0].where;
    expect(where.addedBy).toEqual({ in: ['f1', 'f2'] });
    expect(where.status.in).toEqual(['wishlist', 'backlog', 'play_next', 'paused']);
    expect(where.roomId).toBeNull();
  });

  it('does nothing for a review under 4.0', async () => {
    await notifyFriendRecommendation('me', GAME, { art: 4, gameplay: 3, story: null, sound: null });
    expect(notificationCreate).not.toHaveBeenCalled();
    expect(friendIdsOf).not.toHaveBeenCalled();
  });

  it('does nothing for a game hidden from others', async () => {
    await notifyFriendRecommendation('me', { ...GAME, hiddenFromOthers: true }, HIGH);
    expect(notificationCreate).not.toHaveBeenCalled();
  });

  it('does not tell a friend twice about the same game', async () => {
    notificationFindMany.mockResolvedValue([{ recipientId: 'f1' }]);
    await notifyFriendRecommendation('me', GAME, HIGH);
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    expect(notificationCreate.mock.calls[0][0].data.recipientId).toBe('f2');
  });

  it('skips friends who switched the alert off in the app', async () => {
    wantsAlert.mockImplementation(async (id: string) => id !== 'f1');
    await notifyFriendRecommendation('me', GAME, HIGH);
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    expect(notificationCreate.mock.calls[0][0].data.recipientId).toBe('f2');
  });

  it('never throws, so saving the review is not affected', async () => {
    friendIdsOf.mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(notifyFriendRecommendation('me', GAME, HIGH)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
