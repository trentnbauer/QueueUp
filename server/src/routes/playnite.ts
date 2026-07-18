import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { existingIgdbIds, invalidateExistingIgdbIds } from '../services/gameAccess.js';
import { resolveGameForCreation } from '../services/gameIntake.js';
import { findIgdbIdByTitle } from '../services/igdbClient.js';
import { markOwned } from '../services/gameOwnership.js';
import { generatePlayniteToken, revokePlayniteToken, getPlayniteTokenStatus } from '../services/playniteAuth.js';
import type {
  GeneratePlayniteTokenResult,
  ImportPlayniteLibraryRequest,
  ImportPlayniteLibraryResult,
  PlayniteTokenStatus,
} from '@queueup/shared';

// Playnite libraries can be large (thousands of entries across every emulator/launcher it
// aggregates); this bounds the work one sync can trigger (one IGDB lookup per unique title) rather
// than trusting an arbitrary client-supplied payload size the way the Steam import path (which only
// ever sees appids from Steam's own API) doesn't need to.
const MAX_PLAYNITE_IMPORT_GAMES = 3000;

export default async function playniteRoutes(app: FastifyInstance) {
  // Token issuance/revocation is session-only - a bearer token shouldn't be able to mint another.
  app.post('/api/playnite/token', async (request) => {
    const userId = await request.requireAuth();
    const token = await generatePlayniteToken(userId);
    const result: GeneratePlayniteTokenResult = { token };
    return result;
  });

  app.delete('/api/playnite/token', async (request, reply) => {
    const userId = await request.requireAuth();
    await revokePlayniteToken(userId);
    reply.status(204);
    return null;
  });

  app.get('/api/playnite/token', async (request) => {
    const userId = await request.requireAuth();
    const status = await getPlayniteTokenStatus(userId);
    const result: PlayniteTokenStatus = {
      hasToken: status.hasToken,
      createdAt: status.createdAt?.toISOString() ?? null,
      lastUsedAt: status.lastUsedAt?.toISOString() ?? null,
    };
    return result;
  });

  app.post<{ Body: ImportPlayniteLibraryRequest }>(
    '/api/playnite/import',
    // Mirrors the Steam import rate limit (games.ts) - an expensive operation (up to
    // MAX_PLAYNITE_IMPORT_GAMES sequential IGDB lookups), not something to allow hammering.
    { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const games = request.body?.games;
      if (!Array.isArray(games) || games.length === 0) {
        throw new HttpError(400, 'No games were provided to import.');
      }
      if (games.length > MAX_PLAYNITE_IMPORT_GAMES) {
        throw new HttpError(400, `Too many games in one sync (max ${MAX_PLAYNITE_IMPORT_GAMES}).`);
      }

      // De-dupe titles within the submitted batch (Playnite can list the same game more than once
      // across different launchers/emulators) before spending an IGDB lookup on each.
      const uniqueTitles = [...new Set(games.map((g) => g.title?.trim()).filter((t): t is string => !!t))];

      const [existingIgdbIdSet, shelfGames] = await Promise.all([
        existingIgdbIds(null, userId),
        prisma.game.findMany({ where: { roomId: null, addedBy: userId }, select: { igdbId: true } }),
      ]);
      const ownedIgdbIds: number[] = shelfGames.map((g) => g.igdbId);

      let imported = 0;
      let skipped = 0;
      for (const title of uniqueTitles) {
        try {
          const igdbId = await findIgdbIdByTitle(title);
          if (igdbId === null) {
            skipped++;
            continue;
          }
          if (existingIgdbIdSet.has(igdbId)) {
            ownedIgdbIds.push(igdbId);
            skipped++;
            continue;
          }
          const resolved = await resolveGameForCreation(igdbId);
          await prisma.game.create({
            data: {
              roomId: null,
              addedBy: userId,
              igdbId,
              title: resolved.title,
              platform: resolved.platform,
              genre: resolved.genre,
              maxCoopPlayers: resolved.maxCoopPlayers,
              ggDealsUrl: resolved.ggDealsUrl,
              steamAppid: resolved.steamAppId,
              coverImageUrl: resolved.coverImageUrl,
              releaseYear: resolved.releaseYear,
            },
          });
          existingIgdbIdSet.add(igdbId);
          ownedIgdbIds.push(igdbId);
          imported++;
        } catch {
          // One title failing to resolve (IGDB hiccup, no match, etc.) shouldn't abort the batch.
          skipped++;
        }
      }
      if (imported > 0) await invalidateExistingIgdbIds(null, userId);
      await markOwned(userId, ownedIgdbIds);

      const result: ImportPlayniteLibraryResult = {
        totalReceived: games.length,
        consideredCount: uniqueTitles.length,
        imported,
        skipped,
      };
      return result;
    },
  );
}
