import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { createGameForUser } from '../services/gameIntake.js';
import { unionOwnershipPlatforms } from '../services/gameOwnership.js';
import { listPendingLibraryImports, deletePendingLibraryImport, recordTitleMatchAlias } from '../services/playniteImport.js';
import type { ResolvePendingLibraryImportRequest } from '@queueup/shared';

/** Cookie-authenticated routes backing the (not yet built, see QueueUp#452) Profile Settings review
 * UI for PendingLibraryImport rows - titles from an external-library import (see routes/apiV1.ts'
 * Playnite import) that didn't resolve to an igdbId on their own. Deliberately cookie-session-only,
 * not under /api/v1: this is something a person reviews in the web app, not something the headless
 * Playnite extension itself needs to read back. */
export default async function pendingLibraryImportRoutes(app: FastifyInstance) {
  app.get(
    '/api/library/pending-imports',
    // Same tier as the other occasional Profile Settings actions below (and /api/me/api-keys,
    // /api/me/export in auth.ts) - a normal session comes nowhere close to this.
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      return { pending: await listPendingLibraryImports(userId) };
    },
  );

  /** Resolves a pending row against the igdbId the user picked (from its candidates, or one they
   * searched for themselves instead) - reuses createGameForUser for the "doesn't exist yet" path
   * so a resolved pending import gets exactly the same creation/DLC-linking/approval-flow behavior
   * a real Add Game click would, forcing status 'backlog' since that's what ownedPlatforms
   * requires (see createGameForUser) and matches "I own this" being the entire point of resolving
   * an import. If the igdbId is already on the shelf, unions ownership instead (same wishlist-
   * status guard as the bulk import loop - see its doc comment). Either way, records a
   * TitleMatchAlias so the next time this exact title comes through - this user's next sync, or
   * anyone else's - it resolves automatically instead of landing back in the review queue. */
  app.post<{ Params: { id: string }; Body: ResolvePendingLibraryImportRequest }>(
    '/api/library/pending-imports/:id/resolve',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { id } = request.params;
      const { igdbId } = request.body;
      if (!Number.isInteger(igdbId)) throw new HttpError(400, 'A valid igdbId is required');

      const pending = await prisma.pendingLibraryImport.findFirst({ where: { id, userId } });
      if (!pending) throw new HttpError(404, 'Pending import not found');

      const existing = await prisma.game.findFirst({ where: { roomId: null, addedBy: userId, igdbId } });
      if (existing) {
        if (existing.status !== 'wishlist') {
          await unionOwnershipPlatforms(userId, igdbId, pending.platforms);
        }
      } else {
        await createGameForUser(userId, null, igdbId, { status: 'backlog', ownedPlatforms: pending.platforms });
      }

      await recordTitleMatchAlias(pending.source, pending.title, igdbId);
      await deletePendingLibraryImport(userId, id);

      reply.status(204);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/library/pending-imports/:id',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      await deletePendingLibraryImport(userId, request.params.id);
      reply.status(204);
    },
  );
}
