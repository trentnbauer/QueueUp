import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { BADGE_DEFINITIONS, type BadgeKey, type PublicUserProfile } from '@queueup/shared';

/** The shareable, unauthenticated counterpart to a user's Personal Shelf (issue #511) - reachable
 * at GET /api/public/users/:id (and the web app's /u/:id route) with no cookie/session required at
 * all, unlike every other route in this file's siblings. Deliberately its own file rather than
 * folded into auth.ts/badges.ts - the one place in the app where a route is intentionally reachable
 * by a client with no session, so keeping it visually separate makes that easy to audit rather than
 * something to notice buried among cookie-gated routes. */
export default async function publicProfileRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/public/users/:id', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.params.id },
      select: { displayName: true, avatarColor: true, avatarUrl: true, publicProfileEnabled: true },
    });
    // Same response (404, no distinguishing detail) whether the id doesn't exist at all or exists
    // but hasn't opted in - a scan of ids must not be able to tell "no such user" from "exists but
    // private" apart from the outside.
    if (!user || !user.publicProfileEnabled) throw new HttpError(404, 'Profile not found');

    // Personal Shelf only (roomId: null) - same scope as the release-watch alerts (#510) and the
    // Franchise Finisher/DLC Completionist badges this reuses rarity data alongside; a room game
    // isn't "theirs" to show off the same way a room membership isn't public.
    const [beatenGameCount, currentlyPlayingRows, unlockedBadgeRows, totalUsers, perBadgeCounts] = await Promise.all([
      prisma.game.count({ where: { roomId: null, addedBy: request.params.id, status: { in: ['done', 'replay'] } } }),
      prisma.game.findMany({
        where: { roomId: null, addedBy: request.params.id, status: { in: ['playing', 'play_next'] } },
        select: { id: true, title: true, coverImageUrl: true, platform: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.userBadge.findMany({ where: { userId: request.params.id }, select: { badgeKey: true, createdAt: true } }),
      prisma.user.count(),
      prisma.userBadge.groupBy({ by: ['badgeKey'], _count: { userId: true } }),
    ]);

    const countByKey = new Map(perBadgeCounts.map((r) => [r.badgeKey, r._count.userId]));

    const profile: PublicUserProfile = {
      displayName: user.displayName,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      // Only what's actually unlocked (unlike GET /api/me/badges' full locked+unlocked catalog) -
      // see PublicUserProfile's own doc comment for why.
      badges: unlockedBadgeRows.map((row) => {
        const def = BADGE_DEFINITIONS[row.badgeKey as BadgeKey];
        const unlockedCount = countByKey.get(row.badgeKey) ?? 0;
        return {
          key: def.key,
          name: def.name,
          description: def.description,
          emoji: def.emoji,
          unlockedAt: row.createdAt.toISOString(),
          // totalUsers is at least 1 (this profile's own owner counts), same reasoning as
          // routes/badges.ts's identical computation.
          rarityPercent: Math.round((unlockedCount / totalUsers) * 100),
        };
      }),
      beatenGameCount,
      currentlyPlaying: currentlyPlayingRows,
    };
    return profile;
  });
}
