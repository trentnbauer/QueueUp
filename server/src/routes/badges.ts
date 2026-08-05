import type { FastifyInstance } from 'fastify';
import { ALL_BADGE_KEYS, BADGE_DEFINITIONS, type BadgesResponse, type RefreshBadgesResponse } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { refreshBadges } from '../services/badges.js';

/** Backs the Achievements panel (issue #489) - every badge in the catalog, always all
 * `ALL_BADGE_KEYS.length` of them regardless of what this user has unlocked, so the panel can
 * render locked tiles rather than only ever showing what's already earned. Rarity is computed
 * against every user in the database (not room/friends-scoped, per the issue) - two cheap
 * aggregate queries rather than one row read per badge. */
export default async function badgeRoutes(app: FastifyInstance) {
  app.get(
    '/api/me/badges',
    // A direct, occasional Profile/Achievements-panel visit, not something a normal session comes
    // close to hitting - same tier as the other "check my own stuff" routes (api-keys, export).
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();

      const [totalUsers, unlockedRows, perBadgeCounts] = await Promise.all([
        prisma.user.count(),
        prisma.userBadge.findMany({ where: { userId }, select: { badgeKey: true, createdAt: true } }),
        prisma.userBadge.groupBy({ by: ['badgeKey'], _count: { userId: true } }),
      ]);

      const unlockedAtByKey = new Map(unlockedRows.map((r) => [r.badgeKey, r.createdAt.toISOString()]));
      const countByKey = new Map(perBadgeCounts.map((r) => [r.badgeKey, r._count.userId]));

      const response: BadgesResponse = {
        badges: ALL_BADGE_KEYS.map((key) => {
          const def = BADGE_DEFINITIONS[key];
          const unlockedCount = countByKey.get(key) ?? 0;
          return {
            key,
            name: def.name,
            description: def.description,
            emoji: def.emoji,
            unlockedAt: unlockedAtByKey.get(key) ?? null,
            // totalUsers is at least 1 (the caller is themselves a user) so this never divides by
            // zero; rounded to a whole percent - a fractional-percent "rarity" reads as false
            // precision for what's ultimately a small user count.
            rarityPercent: Math.round((unlockedCount / totalUsers) * 100),
          };
        }),
      };
      return response;
    },
  );

  // "Refresh Achievements" (issue: imported Switch games via Playnite before the platform-sync
  // badges existed, no way to trigger the achievement again without another import) - re-derives
  // every badge this user currently, unambiguously qualifies for but hasn't been credited with yet.
  // A real (if bounded) DB scan across several tables, not a cheap read - same rate-limit tier as
  // the other on-demand rescans (sync-steam-completions), not the plain-read tier GET above uses.
  app.post(
    '/api/me/badges/refresh',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const unlockedBadges = await refreshBadges(userId);
      const response: RefreshBadgesResponse = { unlockedBadges };
      return response;
    },
  );
}
