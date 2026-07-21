import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { loadGameOr404, requireGameTagAccess } from '../services/gameAccess.js';
import { gameInclude, serializeGame } from '../services/gameSerializer.js';
import { listTags, loadOwnTagOr404, createTag, findOrCreateTag, normalizeTagName, assertValidTagName } from '../services/tags.js';
import type { ApplyTagRequest, CreateTagRequest, RenameTagRequest } from '@queueup/shared';

/** Turns a Tag @@unique([userId, name]) collision into the same 409 shape everywhere it can happen
 * (create and rename both hit it) instead of duplicating the try/catch at each call site. */
function conflictOnDuplicateName(err: unknown, name: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new HttpError(409, `You already have a tag named "${name}"`);
  }
  throw err;
}

export default async function tagRoutes(app: FastifyInstance) {
  // Same tier used elsewhere in the app for lightweight, single-item routes (e.g.
  // /api/games/:id/achievements, /api/games/:id/target-price) - well above any legitimate usage
  // of a manual tagging flow, just enough headroom to blunt abuse of a compromised session.
  const tagsRateLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  // Every tag the caller owns, across their whole account (not scoped to the active
  // shelf/room view) - backs the "apply an existing tag" picker in GameDetailModal, which needs
  // the full set to offer regardless of which games are currently loaded in the grid.
  app.get('/api/tags', tagsRateLimit, async (request) => {
    const userId = await request.requireAuth();
    return { tags: await listTags(userId) };
  });

  app.post<{ Body: CreateTagRequest }>('/api/tags', tagsRateLimit, async (request, reply) => {
    const userId = await request.requireAuth();
    const name = normalizeTagName(request.body?.name ?? '');
    try {
      const tag = await createTag(userId, name);
      reply.status(201);
      return { tag };
    } catch (err) {
      conflictOnDuplicateName(err, name);
    }
  });

  app.patch<{ Params: { id: string }; Body: RenameTagRequest }>('/api/tags/:id', tagsRateLimit, async (request) => {
    const userId = await request.requireAuth();
    await loadOwnTagOr404(request.params.id, userId);

    const name = normalizeTagName(request.body?.name ?? '');
    assertValidTagName(name);
    try {
      const tag = await prisma.tag.update({ where: { id: request.params.id }, data: { name } });
      return { tag: { id: tag.id, name: tag.name, createdAt: tag.createdAt.toISOString() } };
    } catch (err) {
      conflictOnDuplicateName(err, name);
    }
  });

  // Deletes the tag itself, not just its association with one game - cascades (via
  // GameTag.tag's onDelete: Cascade) to remove it from every game it was applied to. No "still in
  // use, can't delete" guard: this is a plain text label with no other data hanging off it, so
  // forcing an untag-everything-first step before deleting one would just be friction for a v1
  // organizational feature, not a safeguard protecting anything of value.
  app.delete<{ Params: { id: string } }>('/api/tags/:id', tagsRateLimit, async (request, reply) => {
    const userId = await request.requireAuth();
    await loadOwnTagOr404(request.params.id, userId);
    await prisma.tag.delete({ where: { id: request.params.id } });
    reply.status(204);
    return null;
  });

  // Applies a tag to a specific game by name, creating it first if the caller doesn't already have
  // one with that name (see findOrCreateTag) - the modal's "type a tag, hit enter" flow is one
  // request instead of create-then-apply. Re-applying an already-applied tag is a no-op (upsert),
  // not an error, so a slow double-click can't surface a spurious failure.
  app.post<{ Params: { id: string }; Body: ApplyTagRequest }>('/api/games/:id/tags', tagsRateLimit, async (request) => {
    const userId = await request.requireAuth();
    const game = await loadGameOr404(request.params.id);
    requireGameTagAccess(game, userId);

    const tag = await findOrCreateTag(userId, request.body?.name ?? '');
    await prisma.gameTag.upsert({
      where: { gameId_tagId: { gameId: game.id, tagId: tag.id } },
      create: { gameId: game.id, tagId: tag.id },
      update: {},
    });

    const updated = await prisma.game.findUniqueOrThrow({ where: { id: game.id }, include: gameInclude });
    return { game: await serializeGame(updated, userId) };
  });

  // Detaches a tag from just this game - the tag itself (and its application to any other game)
  // is untouched. Use DELETE /api/tags/:id instead to remove the tag entirely.
  app.delete<{ Params: { id: string; tagId: string } }>(
    '/api/games/:id/tags/:tagId',
    tagsRateLimit,
    async (request) => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      requireGameTagAccess(game, userId);

      // Scoped by tag.userId too (not just tagId) so this can't be used to probe/detach a tag id
      // that happens to belong to someone else - in practice requireGameTagAccess already
      // guarantees any tag on this game is the caller's own (only the adder can tag a game), but
      // this keeps the guarantee explicit at the write itself rather than relying solely on that
      // invariant holding.
      await prisma.gameTag.deleteMany({
        where: { gameId: game.id, tagId: request.params.tagId, tag: { userId } },
      });

      const updated = await prisma.game.findUniqueOrThrow({ where: { id: game.id }, include: gameInclude });
      return { game: await serializeGame(updated, userId) };
    },
  );
}
