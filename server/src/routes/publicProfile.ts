import type { FastifyInstance } from 'fastify';
import type { GameStatus } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { BADGE_DEFINITIONS, ROOM_PLATFORM_LABELS, sortPlatformLabel, sortPlatforms, type BadgeKey, type PublicProfileGame, type PublicUserProfile } from '@queueup/shared';
import { toGameReviewDto } from '../services/gameSerializer.js';
import { areFriends } from '../services/friendships.js';

/** Whether two people's ownership claims on the same title let them play it together: an empty
 * platform list means "platform unknown" and matches anything (same rule as room ownership in
 * gameOwnership.ts); otherwise they need a platform in common. */
export function ownershipPlatformsOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.length === 0 || b.length === 0 || a.some((p) => b.includes(p));
}

/** The shareable, unauthenticated counterpart to a user's Personal Shelf (issue #511) - reachable
 * at GET /api/public/users/:id (and the web app's /u/:id route) with no cookie/session required at
 * all, unlike every other route in this file's siblings. Deliberately its own file rather than
 * folded into auth.ts/badges.ts - the one place in the app where a route is intentionally reachable
 * by a client with no session, so keeping it visually separate makes that easy to audit rather than
 * something to notice buried among cookie-gated routes. */
export default async function publicProfileRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/public/users/:id', async (request) => {
    // The path segment is either the user id or their vanity profile name (slugs can never look like
    // an id, see normalizeProfileSlug, so the two can't collide).
    const key = request.params.id.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: request.params.id }, { profileSlug: key }] },
      select: { id: true, displayName: true, avatarColor: true, avatarUrl: true, publicProfileEnabled: true, ownedPlatforms: true, createdAt: true },
    });
    // Same response (404, no distinguishing detail) whether the id doesn't exist at all or exists
    // but hasn't opted in - a scan of ids must not be able to tell "no such user" from "exists but
    // private" apart from the outside.
    if (!user) throw new HttpError(404, 'Profile not found');
    // Signed-in viewers get more than the anonymous page: the owner and their friends see the
    // profile even when it isn't public (issue #624 - one profile page for /u/ and /friends/).
    const viewerId = await request.currentUserId();
    const viewer: 'self' | 'friend' | 'public' =
      viewerId === user.id ? 'self' : viewerId && (await areFriends(viewerId, user.id)) ? 'friend' : 'public';
    if (!user.publicProfileEnabled && viewer === 'public') throw new HttpError(404, 'Profile not found');

    // Personal Shelf only (roomId: null) - same scope as the release-watch alerts (#510) and the
    // Franchise Finisher/DLC Completionist badges this reuses rarity data alongside; a room game
    // isn't "theirs" to show off the same way a room membership isn't public.
    const [beatenGameRows, currentlyPlayingRows, unlockedBadgeRows, totalUsers, perBadgeCounts] = await Promise.all([
      prisma.game.findMany({
        where: { roomId: null, addedBy: user.id, status: { in: ['done', 'replay'] }, hiddenFromOthers: false },
        orderBy: { updatedAt: 'desc' },
        take: 300,
        include: { reviews: { where: { userId: user.id } } },
      }),
      prisma.game.findMany({
        where: { roomId: null, addedBy: user.id, status: 'playing', hiddenFromOthers: false },
        select: { id: true, title: true, coverImageUrl: true, platform: true, igdbId: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.userBadge.findMany({ where: { userId: user.id }, select: { badgeKey: true, createdAt: true } }),
      prisma.user.count(),
      prisma.userBadge.groupBy({ by: ['badgeKey'], _count: { userId: true } }),
    ]);

    const [shelfRows, ownedRows] = await Promise.all([
      prisma.game.findMany({
        where: { roomId: null, addedBy: user.id, hiddenFromOthers: false, archivedAt: null, status: { in: ['play_next', 'backlog', 'replay', 'wishlist', 'playing', 'done', 'dropped'] } },
        select: { id: true, title: true, coverImageUrl: true, platform: true, status: true, igdbId: true, updatedAt: true, votes: { select: { value: true } } },
      }),
      prisma.gameOwnership.findMany({ where: { userId: user.id }, select: { igdbId: true, platforms: true } }),
    ]);
    // "You both own these": only for a signed-in viewer looking at someone else's profile. Same
    // platform rule as room ownership (gameOwnership.ts) - an empty platform list means "platform
    // unknown" and matches anything; otherwise the two claims need a platform in common.
    const ownerPlatformsByIgdb = new Map(ownedRows.map((r) => [r.igdbId, r.platforms]));
    const viewerOwned =
      viewerId && viewer !== 'self'
        ? await prisma.gameOwnership.findMany({
            where: { userId: viewerId, igdbId: { in: [...ownerPlatformsByIgdb.keys()] } },
            select: { igdbId: true, platforms: true },
          })
        : [];
    const bothOwnIgdb = new Set(
      viewerOwned
        .filter((v) => ownershipPlatformsOverlap(ownerPlatformsByIgdb.get(v.igdbId) ?? [], v.platforms))
        .map((v) => v.igdbId),
    );
    // Anything the viewer already has: owned, or on their own Personal Shelf in any status (adding
    // it again would just duplicate it).
    const viewerHasIgdb = new Set<number>();
    if (viewerId && viewer !== 'self') {
      const igdbIds = [...new Set([...shelfRows.map((g) => g.igdbId), ...currentlyPlayingRows.map((g) => g.igdbId)])];
      const [viewerShelf, viewerOwnership] = await Promise.all([
        prisma.game.findMany({ where: { roomId: null, addedBy: viewerId, igdbId: { in: igdbIds } }, select: { igdbId: true } }),
        prisma.gameOwnership.findMany({ where: { userId: viewerId, igdbId: { in: igdbIds } }, select: { igdbId: true } }),
      ]);
      for (const r of [...viewerShelf, ...viewerOwnership]) viewerHasIgdb.add(r.igdbId);
    }
    const viewerHasGame = (igdbId: number) => viewerHasIgdb.has(igdbId);
    const score = (g: (typeof shelfRows)[number]) => g.votes.reduce((sum, v) => sum + v.value, 0);
    const toGame = (g: (typeof shelfRows)[number]): PublicProfileGame => ({
      id: g.id,
      title: g.title,
      coverImageUrl: g.coverImageUrl,
      platform: sortPlatformLabel(g.platform),
      igdbId: g.igdbId,
      ...(bothOwnIgdb.has(g.igdbId) && { bothOwn: true }),
      ...(viewerHasGame(g.igdbId) && { viewerHas: true }),
    });
    const byScore = (a: (typeof shelfRows)[number], b: (typeof shelfRows)[number]) => score(b) - score(a) || b.updatedAt.getTime() - a.updatedAt.getTime();
    const playNext = shelfRows.filter((g) => g.status === 'play_next').sort(byScore);
    const backlogTop = shelfRows.filter((g) => g.status === 'backlog').sort(byScore);
    const upNext = [...playNext, ...backlogTop].slice(0, 10).map(toGame);
    const wishlist = shelfRows.filter((g) => g.status === 'wishlist').sort(byScore).map(toGame);
    // Wishlisted games aren't owned yet, even if an ownership row exists for the title.
    const library = shelfRows
      .filter((g) => ownerPlatformsByIgdb.has(g.igdbId) && g.status !== 'wishlist')
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(toGame);
    const bothOwn = library.filter((g) => g.bothOwn);

    const countByKey = new Map(perBadgeCounts.map((r) => [r.badgeKey, r._count.userId]));

    const beatenWhere = { roomId: null, addedBy: user.id, status: { in: ['done', 'replay'] as GameStatus[] }, hiddenFromOthers: false };
    // 100%: the game's own flag (any Steam sync saw it complete) or this user's own completion
    // record for the title (AchievementCompletion, keyed by igdbId, not by Game row).
    const completedIgdbIds = (await prisma.achievementCompletion.findMany({ where: { userId: user.id }, select: { igdbId: true } })).map((r) => r.igdbId);
    const completedIgdb = new Set(completedIgdbIds);
    const isFullyCompleted = (g: { steamFullyCompleted: boolean; igdbId: number }) => g.steamFullyCompleted || completedIgdb.has(g.igdbId);
    const [beatenGameCount, fullyCompletedCount] = await Promise.all([
      prisma.game.count({ where: beatenWhere }),
      prisma.game.count({ where: { ...beatenWhere, OR: [{ steamFullyCompleted: true }, { igdbId: { in: completedIgdbIds } }] } }),
    ]);
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
      fullyCompletedCount,
      currentlyPlaying: currentlyPlayingRows.map((g) => ({
        ...g,
        platform: sortPlatformLabel(g.platform),
        ...(bothOwnIgdb.has(g.igdbId) && { bothOwn: true }),
        ...(viewerHasGame(g.igdbId) && { viewerHas: true }),
      })),
      systems: sortPlatforms(user.ownedPlatforms).map((p) => ROOM_PLATFORM_LABELS[p]),
      // 100% games first, then reviewed games, then the rest, each group newest-first (the query's
      // own order).
      beatenGames: [...beatenGameRows]
        .sort(
          (a, b) =>
            Number(isFullyCompleted(b)) - Number(isFullyCompleted(a)) ||
            Number(b.reviews.length > 0) - Number(a.reviews.length > 0),
        )
        .map((g) => ({
          id: g.id,
          title: g.title,
          coverImageUrl: g.coverImageUrl,
          genre: g.genre,
          replaying: g.status === 'replay',
          review: toGameReviewDto(g.reviews[0]),
          fullyCompleted: isFullyCompleted(g),
        })),
      memberSince: user.createdAt.toISOString(),
      wishlist,
      upNext,
      library,
      bothOwn,
      viewer,
      userId: user.id,
    };
    return profile;
  });
}
