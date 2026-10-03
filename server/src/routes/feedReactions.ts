import type { FastifyInstance } from 'fastify';
import { BADGE_DEFINITIONS, FEED_REACTION_EMOJI, type BadgeKey, type SetFeedReactionRequest } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { areFriends } from '../services/friendships.js';

const ALLOWED = new Set<string>(FEED_REACTION_EMOJI);

/** Who owns an activity feed entry, and what to call it in a notification. Null when the entry
 * doesn't exist or isn't something friends can see (a hidden game's entry). */
async function resolveEntry(entryId: string): Promise<{ ownerId: string; title: string } | null> {
  // Achievements have no row of their own: their id is "badge:<userId>:<badge>".
  if (entryId.startsWith('badge:')) {
    const [, ownerId, badge] = entryId.split(':');
    if (!ownerId || !badge) return null;
    // Feed ids carry the badge key with dashes (see buildFeed in friends.ts).
    const def = BADGE_DEFINITIONS[badge.replace(/-/g, '_') as BadgeKey];
    return { ownerId, title: def ? `the ${def.name} badge` : badge.replace(/-/g, ' ') };
  }
  const row = await prisma.roomActivity.findUnique({ where: { id: entryId } });
  const payload = row?.payload as { gameId?: string; title?: string } | null;
  if (!row?.recipientId || !payload?.title) return null;
  if (row.type !== 'game_added' && row.type !== 'status_changed') return null;
  if (payload.gameId) {
    // Same rule as the feed itself: a hidden or deleted game's entry is not visible to friends.
    const visible = await prisma.game.count({ where: { id: payload.gameId, hiddenFromOthers: false } });
    if (!visible) return null;
  }
  return { ownerId: row.recipientId, title: payload.title };
}

/** Emoji reactions on friends' activity feed entries. */
export default async function feedReactionRoutes(app: FastifyInstance) {
  app.post<{ Body: SetFeedReactionRequest }>(
    '/api/feed-reactions',
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request) => {
      const me = await request.requireAuth();
      const { entryId, emoji } = request.body ?? {};
      if (typeof entryId !== 'string' || !entryId || entryId.length > 200) throw new HttpError(400, 'An entry is required');
      if (emoji !== null && (typeof emoji !== 'string' || !ALLOWED.has(emoji))) throw new HttpError(400, 'That reaction is not available');

      if (emoji === null) {
        await prisma.feedReaction.deleteMany({ where: { entryId, userId: me } });
        return { ok: true as const };
      }

      const entry = await resolveEntry(entryId);
      if (!entry) throw new HttpError(404, 'Entry not found');
      if (entry.ownerId === me) throw new HttpError(400, "You can't react to your own activity");
      if (!(await areFriends(me, entry.ownerId))) throw new HttpError(404, 'Entry not found');

      const existing = await prisma.feedReaction.findUnique({ where: { entryId_userId: { entryId, userId: me } }, select: { emoji: true } });
      await prisma.feedReaction.upsert({
        where: { entryId_userId: { entryId, userId: me } },
        create: { entryId, userId: me, emoji },
        update: { emoji },
      });

      // Tell the owner the first time someone reacts; changing an emoji afterwards stays quiet.
      if (!existing) {
        const reactor = await prisma.user.findUnique({ where: { id: me }, select: { displayName: true } });
        await prisma.notification
          .create({
            data: {
              recipientId: entry.ownerId,
              actorId: me,
              roomName: 'Activity',
              type: 'feed_reaction',
              message: `${reactor?.displayName ?? 'A friend'} reacted ${emoji} to ${entry.title}`,
            },
          })
          .catch(() => undefined);
      }
      return { ok: true as const };
    },
  );
}
