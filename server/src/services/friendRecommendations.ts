import { prisma } from '../db/client.js';
import { friendIdsOf } from './friendships.js';
import { isInAppEnabled } from './notificationPreferences.js';
import { reviewAverage } from './reviewAverage.js';

/** A review at or above this average (of its scored categories, out of 5) counts as a recommendation. */
export const RECOMMEND_MIN_AVERAGE = 4;
/** Statuses where a friend's copy means "I might play this" - the only ones we nudge. */
const CONSIDERING_STATUSES = ['wishlist', 'backlog', 'play_next', 'paused'] as const;
const MAX_FRIENDS = 300;

/** When someone gives a game from their Personal Shelf a high review, tells each friend who has the
 * same game wishlisted or in their backlog ("Sam rated Hades 4.5/5"). One notification per friend
 * per reviewer per game, however often the review is edited; friends can switch these off in
 * Settings → Notifications. Never for a game the reviewer hides from others, and never for games the
 * friend has already finished, dropped or doesn't have. Failures are logged and swallowed: the review
 * itself already saved. */
export async function notifyFriendRecommendation(
  reviewerId: string,
  game: { id: string; igdbId: number; title: string; hiddenFromOthers: boolean },
  review: { art: number | null; gameplay: number | null; story: number | null; sound: number | null },
): Promise<void> {
  try {
    const average = reviewAverage(review);
    if (average === null || average < RECOMMEND_MIN_AVERAGE || game.hiddenFromOthers) return;

    const friendIds = (await friendIdsOf(reviewerId)).slice(0, MAX_FRIENDS);
    if (friendIds.length === 0) return;

    const [copies, reviewer] = await Promise.all([
      prisma.game.findMany({
        where: { roomId: null, igdbId: game.igdbId, addedBy: { in: friendIds }, status: { in: [...CONSIDERING_STATUSES] } },
        select: { id: true, addedBy: true },
      }),
      prisma.user.findUnique({ where: { id: reviewerId }, select: { displayName: true } }),
    ]);
    if (copies.length === 0) return;
    // Each friend's copy of the game identifies "this reviewer told me about this game already".
    const already = await prisma.notification.findMany({
      where: { type: 'friend_recommendation', actorId: reviewerId, gameId: { in: copies.map((c) => c.id) } },
      select: { recipientId: true },
    });
    const alreadyTold = new Set(already.map((n) => n.recipientId));
    const name = reviewer?.displayName ?? 'A friend';

    for (const copy of copies) {
      if (alreadyTold.has(copy.addedBy)) continue;
      if (!(await isInAppEnabled(copy.addedBy, 'friend_recommendation'))) continue;
      await prisma.notification.create({
        data: {
          recipientId: copy.addedBy,
          actorId: reviewerId,
          roomName: 'Personal Shelf',
          gameId: copy.id,
          type: 'friend_recommendation',
          message: `${name} rated "${game.title}" ${average.toFixed(1)}/5 - it's on your list`,
        },
      });
    }
  } catch (err) {
    console.error('[notifications] failed to write friend recommendation notifications', err);
  }
}
