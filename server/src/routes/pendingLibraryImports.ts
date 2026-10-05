import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../db/client.js';
import { recordSyncSources } from '../services/syncSources.js';
import { HttpError } from '../util/httpError.js';
import {
  listPendingLibraryImports,
  dismissPendingLibraryImport,
  dismissPendingLibraryImports,
  restorePendingLibraryImport,
  getPlayniteImportProgress,
} from '../services/playniteImport.js';
import { addResolvedGame, isSyncSource, resolvePendingImport } from '../services/pendingImportResolve.js';
import { aiMatchPendingImports } from '../services/ai/aiImportMatch.js';
import { aiClassifyPendingImports } from '../services/ai/aiImportClassify.js';
import { parseBundleIgdbIds } from '../services/bundleImport.js';
import type {
  AiClassifyPendingResponse,
  AiMatchPendingResponse,
  AiPendingChunkRequest,
  DismissPendingLibraryImportsRequest,
  PlayniteImportProgress,
  ResolvePendingLibraryImportBundleRequest,
  ResolvePendingLibraryImportRequest,
} from '@queueup/shared';

/** Cookie-authenticated routes backing the (not yet built, see QueueUp#452) Profile Settings review
 * UI for PendingLibraryImport rows - titles from an external-library import (see routes/apiV1.ts'
 * Playnite import) that didn't resolve to an igdbId on their own. Deliberately cookie-session-only,
 * not under /api/v1: this is something a person reviews in the web app, not something the headless
 * Playnite extension itself needs to read back. */
// One press of an AI button now works through the whole queue as a series of these requests (each
// up to three AI calls), so the limit has to allow a long run; what bounds cost is the provider the
// person chose, or the daily limit on the shared AI key.
const AI_CHUNK_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

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

  // Just the number waiting, for the Needs Review badge - polled app-wide, so it stays one COUNT
  // instead of building the whole review list (with match suggestions) every 30 seconds.
  app.get('/api/library/pending-imports/count', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => {
    const userId = await request.requireAuth();
    return { count: await prisma.pendingLibraryImport.count({ where: { userId, dismissedAt: null } }) };
  });

  /** Titles the user dismissed instead of matching (shown under the shelf's "+" filters). */
  app.get(
    '/api/library/pending-imports/dismissed',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      return { pending: await listPendingLibraryImports(userId, true) };
    },
  );

  /** Undoes a dismissal: the title goes back to the "needs matching" list. */
  app.post<{ Params: { id: string } }>(
    '/api/library/pending-imports/:id/restore',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      await restorePendingLibraryImport(userId, request.params.id);
      reply.status(204);
    },
  );

  /** Resolves a pending row against the igdbId the user picked (from its candidates, or one they
   * searched for themselves instead) - reuses createGameForUser for the "doesn't exist yet" path
   * so a resolved pending import gets exactly the same creation/DLC-linking/approval-flow behavior
   * a real Add Game click would, forcing status 'backlog' since that's what ownedPlatforms
   * requires (see createGameForUser) and matches "I own this" being the entire point of resolving
   * an import. If the igdbId is already on the shelf, unions ownership instead (same wishlist-
   * status guard as the bulk import loop - see its doc comment). Either way, records a
   * TitleMatchAlias (scoped to this user - see userAliasSource) so the next time this exact title
   * comes through their sync it resolves automatically instead of landing back in the review queue. */
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

      await resolvePendingImport(userId, pending, igdbId);

      reply.status(204);
    },
  );

  /** Asks the AI to match the waiting titles (issue #819). Very confident picks are matched right
   * away; the rest come back as suggestions the dialog flags with "AI". Needs AI set up (400 if not).
   * Tight limit: each call is a paid request to the person's own provider. */
  app.post(
    '/api/library/pending-imports/ai-match',
    { config: { rateLimit: AI_CHUNK_RATE_LIMIT } },
    async (request: FastifyRequest<{ Body: AiPendingChunkRequest }>): Promise<AiMatchPendingResponse> => {
      const userId = await request.requireAuth();
      return aiMatchPendingImports(userId, request.body?.after);
    },
  );

  /** Resolves a pending row that is really a bundle (issue #857): every game inside it is added the
   * same way a single resolve adds one. The row is then dismissed rather than deleted, so a later
   * sync that still reports the bundle's title doesn't queue it up again for review. No title alias
   * is recorded, since a title matching several games isn't one igdbId to remember. Safe to retry
   * after a failure part way: games already added are only given the platforms. */
  app.post<{ Params: { id: string }; Body: ResolvePendingLibraryImportBundleRequest }>(
    '/api/library/pending-imports/:id/resolve-bundle',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      const { id } = request.params;
      const igdbIds = parseBundleIgdbIds(request.body?.igdbIds);

      const pending = await prisma.pendingLibraryImport.findFirst({ where: { id, userId } });
      if (!pending) throw new HttpError(404, 'Pending import not found');

      for (const igdbId of igdbIds) await addResolvedGame(userId, pending, igdbId);

      if (isSyncSource(pending.source)) await recordSyncSources(userId, igdbIds, pending.source);
      await dismissPendingLibraryImport(userId, id);

      reply.status(204);
    },
  );

  /** Asks the AI which waiting titles are not plain games (issue #828). Changes nothing: the dialog
   * shows the suggestions and the person skips them with dismiss-many. Needs AI set up (400 if not). */
  app.post(
    '/api/library/pending-imports/ai-classify',
    { config: { rateLimit: AI_CHUNK_RATE_LIMIT } },
    async (request: FastifyRequest<{ Body: AiPendingChunkRequest }>): Promise<AiClassifyPendingResponse> => {
      const userId = await request.requireAuth();
      return aiClassifyPendingImports(userId, request.body?.after);
    },
  );

  /** Dismisses several pending rows at once ("skip all of these"). Soft dismiss, so every one can be
   * restored from the Dismissed list. */
  app.post<{ Body: DismissPendingLibraryImportsRequest }>(
    '/api/library/pending-imports/dismiss-many',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const ids = request.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((i) => typeof i === 'string')) {
        throw new HttpError(400, 'ids must be a list of 1 to 200 pending import ids');
      }
      return { dismissed: await dismissPendingLibraryImports(userId, ids) };
    },
  );

  /** Dismisses a pending row without resolving it. Soft-dismiss (see dismissPendingLibraryImport),
   * not a hard delete (issue #589) - a hard delete here left no record that the user had already
   * looked at and rejected this title, so the very next sync that still couldn't auto-resolve it
   * would upsert a brand-new row and resurrect exactly what was dismissed. */
  app.delete<{ Params: { id: string } }>(
    '/api/library/pending-imports/:id',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = await request.requireAuth();
      await dismissPendingLibraryImport(userId, request.params.id);
      reply.status(204);
    },
  );

  /** Issue #583: a browser-session counterpart to GET /api/v1/library/import-playnite/progress -
   * that one's bearer-API-key-only (the Playnite extension polls its own run), so it can't be hit
   * from a cookie session. usePlayniteSyncToasts.ts polls this one continuously (not just while a
   * run is known to be active) so it can notice a sync the *extension* started, whether or not this
   * tab was open when it did. max is generous relative to that poll cadence (5s) for the same
   * shared-household-IP reason as GET /api/rooms/active-spins - rate limiting here keys by IP, not
   * session, so a few tabs across one household shouldn't 429. */
  app.get(
    '/api/library/import-playnite/progress',
    { config: { rateLimit: { max: 200, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const progress: PlayniteImportProgress | null = await getPlayniteImportProgress(userId);
      return { progress };
    },
  );
}
