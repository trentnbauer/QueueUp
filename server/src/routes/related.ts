import type { FastifyInstance } from 'fastify';
import type { GameRelatedResponse, MergeDetailsResponse, RelatedGame } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { loadGameOr404, requireGameReadAccess } from '../services/gameAccess.js';
import { getGameCompanies, getGameEditions } from '../services/igdbClient.js';
import { remasterOf } from '../services/ai/aiDuplicates.js';

const pick = { id: true, title: true, coverImageUrl: true, status: true } as const;

/** Everything tied to one game, for the card's "Related games" sheet (the card's More menu): the bundle it came out of or holds, the base
 * game or add-ons it has, what it is a remaster or remake of (or what remade it), games merged into it and its other editions. */
export default async function relatedRoutes(app: FastifyInstance) {
  /** Developer and publisher for up to 20 IGDB ids, for the merge and remaster screens. A failure just leaves them unknown. */
  app.get<{ Querystring: { igdbIds?: string } }>(
    '/api/games/merge-details',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request): Promise<MergeDetailsResponse> => {
      await request.requireAuth();
      const ids = [...new Set((request.query.igdbIds ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 20);
      if (ids.length === 0) return { details: {} };
      try {
        const companies = await getGameCompanies(ids);
        return { details: Object.fromEntries(ids.map((id) => [id, { developer: companies.get(id)?.developer ?? null, publisher: companies.get(id)?.publisher ?? null }])) };
      } catch {
        return { details: {} };
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/games/:id/related',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request): Promise<GameRelatedResponse> => {
      const userId = await request.requireAuth();
      const game = await loadGameOr404(request.params.id);
      await requireGameReadAccess(game, userId);
      const shelf = game.roomId === null;
      const scope = shelf ? { roomId: null, addedBy: userId } : { roomId: game.roomId };

      const [bundle, bundled, base, dlc] = await Promise.all([
        game.bundleGameId ? prisma.game.findUnique({ where: { id: game.bundleGameId }, select: pick }) : null,
        prisma.game.findMany({ where: { bundleGameId: game.id }, select: pick, orderBy: { title: 'asc' } }),
        game.baseGameId ? prisma.game.findUnique({ where: { id: game.baseGameId }, select: pick }) : null,
        prisma.game.findMany({ where: { baseGameId: game.id }, select: pick, orderBy: { title: 'asc' } }),
      ]);

      // Remasters, remakes and merged duplicates are things a person records about their own shelf.
      let remaster: GameRelatedResponse['remaster'] = null;
      let remadeAs: GameRelatedResponse['remadeAs'] = [];
      let merged: GameRelatedResponse['merged'] = [];
      if (shelf) {
        remaster = await remasterOf(userId, game);
        const rows = await prisma.duplicateDismissal.findMany({
          where: { userId, kind: { in: ['remaster', 'remake'] }, remasterIgdbId: { not: game.igdbId }, OR: [{ igdbIdLow: game.igdbId }, { igdbIdHigh: game.igdbId }] },
          select: { kind: true, remasterIgdbId: true },
        });
        const later = await prisma.game.findMany({ where: { ...scope, igdbId: { in: rows.map((r) => r.remasterIgdbId).filter((i): i is number => i !== null) } }, select: { ...pick, igdbId: true } });
        remadeAs = rows.flatMap((r) => {
          const g = later.find((x) => x.igdbId === r.remasterIgdbId);
          return g ? [{ kind: r.kind as 'remaster' | 'remake', game: { id: g.id, title: g.title, coverImageUrl: g.coverImageUrl, status: g.status } satisfies RelatedGame }] : [];
        });
        const redirects = await prisma.gameMatchRedirect.findMany({ where: { userId, toIgdbId: game.igdbId }, orderBy: { createdAt: 'desc' } });
        merged = redirects.map((r) => ({ igdbId: r.fromIgdbId, title: r.fromTitle, coverImageUrl: r.fromCoverImageUrl }));
      }

      // Other editions (Deluxe, GOTY...) come from IGDB; a failure there just leaves the rest of the sheet.
      let editions: GameRelatedResponse['editions'] = [];
      try {
        const found = await getGameEditions(game.igdbId);
        const onList = found.length ? await prisma.game.findMany({ where: { ...scope, igdbId: { in: found.map((e) => e.igdbId) } }, select: { id: true, igdbId: true } }) : [];
        editions = found.map((e) => ({ igdbId: e.igdbId, title: e.title, coverImageUrl: e.coverImageUrl, releaseYear: e.releaseYear, gameId: onList.find((g) => g.igdbId === e.igdbId)?.id ?? null }));
      } catch {
        editions = [];
      }

      return { bundle, bundled, base, dlc, remaster, remadeAs, merged, editions };
    },
  );
}
