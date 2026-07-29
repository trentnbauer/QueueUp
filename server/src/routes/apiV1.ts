import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { HttpError } from '../util/httpError.js';
import { prisma } from '../db/client.js';
import { resolveApiKeyUserId } from '../services/apiKeys.js';
import { requireMembership } from '../services/roomAccess.js';
import { gameInclude, serializeGames } from '../services/gameSerializer.js';
import { createGameForUser, resolveGameForCreation, defaultStatusForRelease, linkDlcToBaseGame } from '../services/gameIntake.js';
import { isAddonCategory } from '../services/igdbClient.js';
import { invalidateExistingIgdbIds } from '../services/gameAccess.js';
import { setOwnershipPlatforms, unionOwnershipPlatforms } from '../services/gameOwnership.js';
import {
  PLAYNITE_SOURCE,
  acquirePlayniteImportLock,
  releasePlayniteImportLock,
  setPlayniteImportProgress,
  getPlayniteImportProgress,
  resolveTitleToIgdbId,
  recordPendingLibraryImport,
  deletePendingLibraryImportByTitle,
} from '../services/playniteImport.js';
import type { CreateGameRequest, LibraryImportEntry, PlayniteImportProgress, PlayniteImportStarted, RoomPlatform } from '@queueup/shared';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by this plugin's own preHandler (see below) - the userId a valid bearer API key
     * resolved to. Deliberately not the same decorator as requireAuth()/currentUserId(): those
     * stay cookie-session-only, so a leaked API key can never reach an app route (account
     * settings, admin, etc.) and a browser session can never reach these routes. */
    apiKeyUserId: string;
  }
}

// Same size limit as the app's own shelf/room views (see MAX_GAMES_PER_LIST in routes/games.ts) -
// a pull is meant for "give me my library," not an unbounded export; a script that needs more can
// page by asking again after removing/archiving older entries, same as the web UI's own guidance.
const MAX_LIBRARY_PULL = 500;

// A script/integration hitting this on its own schedule, not a browser - its own limits rather
// than the per-session ones the cookie-authenticated app routes use (config: rateLimit throughout
// routes/games.ts), so an integration syncing periodically isn't sized against browser traffic.
const apiV1RateLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

// Defensive cap on a single import payload - well above any real library (the Playnite export
// that motivated this topped out at 1107 games total, ~240 of them non-Steam), just guards against
// a malformed/malicious request rather than a real usage limit.
const MAX_PLAYNITE_IMPORT_ENTRIES = 5000;

// Expensive (up to MAX_PLAYNITE_IMPORT_ENTRIES sequential IGDB lookups, in the worst case none of
// them hitting the TitleMatchAlias cache) - same reasoning as Steam's own library import, but a
// higher ceiling than Steam's 3/hour: this is meant to fire on OnLibraryUpdated
// (QueueUpPlayniteExtension#7), which Playnite raises per library-plugin sync, not once per launch
// - a single launch with several sources configured can legitimately trigger it more than once.
// The import lock (acquirePlayniteImportLock) already prevents overlapping runs, which is the
// actual risk this and Steam's limit exist to guard against; this is a coarser backstop on top.
// The extension itself should still debounce rather than lean entirely on this ceiling.
const playniteImportRateLimit = { config: { rateLimit: { max: 12, timeWindow: '1 hour' } } };

// Polled while an import runs, same reasoning as Steam import's own progress route - needs real
// headroom above a ~1/sec polling cadence, well above apiV1RateLimit's general 30/minute.
const playniteImportProgressRateLimit = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

/** Merges duplicate titles in a submitted batch (case-sensitive exact match on the trimmed title -
 * the extension is expected to already dedupe/union by title before sending, per
 * QueueUpPlayniteExtension#7, but this is a cheap defensive backstop against a caller that
 * doesn't), unioning their platforms rather than dropping the union entirely, and drops any entry
 * with a blank title. */
export function dedupeImportEntries(entries: LibraryImportEntry[]): LibraryImportEntry[] {
  const byTitle = new Map<string, Set<RoomPlatform>>();
  for (const entry of entries) {
    const title = entry.title?.trim();
    if (!title) continue;
    if (!byTitle.has(title)) byTitle.set(title, new Set());
    const platforms = byTitle.get(title)!;
    for (const platform of entry.platforms ?? []) platforms.add(platform);
  }
  return [...byTitle.entries()].map(([title, platforms]) => ({ title, platforms: [...platforms] }));
}

/** The slow part of a Playnite library import - one IGDB/alias lookup (and possibly a create) per
 * entry, which can take a while for a big non-Steam library. Run in the background by the route
 * below rather than awaited inline, same reasoning as runSteamLibraryImportLoop (a reverse proxy/
 * CDN in front of this server won't hold a connection open that long). `existingByIgdbId` is
 * mutated in place as entries are processed.
 *
 * Ownership marking is intentionally asymmetric between the two paths, mirroring
 * runSteamLibraryImportLoop exactly: a fresh create always marks ownership (even one that defaults
 * to `wishlist` via defaultStatusForRelease - e.g. a pre-ordered/not-yet-released title someone
 * still meaningfully "has" access to), but an *existing* shelf game only gets its ownership platforms
 * updated when its current status isn't `wishlist` - that status is a first-person "I don't have
 * this yet" claim (see gameOwnership.ts' getOwnershipInfo doc comment on issue #419) that a re-sync
 * shouldn't silently override.
 *
 * Always leaves PlayniteImportProgress `done: true` when it returns, even on an unexpected error,
 * so a client polling for completion doesn't spin forever.
 *
 * `logger` names the failing title on every errored entry (request.log, passed through from the
 * route) - this runs headlessly (fired by the extension on Playnite launch, not a button a person
 * watches and can retry by eye), so "errored: 3" with no record of *which* three is unactionable;
 * a title that errors on every run would otherwise be invisible forever. */
async function runPlayniteImportLoop(
  userId: string,
  entries: LibraryImportEntry[],
  existingByIgdbId: Map<number, { status: string }>,
  consideredCount: number,
  logger: FastifyBaseLogger,
): Promise<void> {
  let matched = 0;
  let unmatched = 0;
  let errored = 0;
  try {
    for (const entry of entries) {
      try {
        const igdbId = await resolveTitleToIgdbId(PLAYNITE_SOURCE, entry.title);
        if (igdbId === null) {
          await recordPendingLibraryImport(userId, PLAYNITE_SOURCE, entry.title, entry.platforms);
          unmatched++;
          continue;
        }

        const existing = existingByIgdbId.get(igdbId);
        if (existing) {
          if (existing.status !== 'wishlist') {
            await unionOwnershipPlatforms(userId, igdbId, entry.platforms);
          }
        } else {
          const resolved = await resolveGameForCreation(igdbId);
          const created = await prisma.game.create({
            data: {
              roomId: null,
              addedBy: userId,
              igdbId,
              title: resolved.title,
              platform: resolved.platform,
              genre: resolved.genre,
              maxCoopPlayers: resolved.maxCoopPlayers,
              timeToBeatHours: resolved.timeToBeatHours,
              timeToBeatRushedHours: resolved.timeToBeatRushedHours,
              timeToBeatCompletionistHours: resolved.timeToBeatCompletionistHours,
              ggDealsUrl: resolved.ggDealsUrl,
              steamAppid: resolved.steamAppId,
              coverImageUrl: resolved.coverImageUrl,
              releaseYear: resolved.releaseYear,
              releaseDate: resolved.releaseDate,
              igdbCollectionId: resolved.igdbCollectionId,
              reviewScore: resolved.reviewScore,
              status: defaultStatusForRelease(resolved.releaseDate),
            },
          });
          // Issue #338 precedent, same as the Steam import loop: a library commonly includes DLC
          // entries alongside their base game - ensure the base game is present too and link back.
          if (resolved.parentGameIgdbId && isAddonCategory(resolved.category)) {
            const base = await linkDlcToBaseGame(created.id, resolved.parentGameIgdbId, null, userId);
            if (base && !existingByIgdbId.has(base.baseIgdbId)) {
              existingByIgdbId.set(base.baseIgdbId, { status: 'backlog' });
              await unionOwnershipPlatforms(userId, base.baseIgdbId, entry.platforms);
            }
          }
          existingByIgdbId.set(igdbId, { status: created.status });
          await setOwnershipPlatforms(userId, igdbId, entry.platforms);
        }
        // A title that previously landed in the review queue (issue #452) may now resolve - via a
        // freshly-written TitleMatchAlias, whether from this same title exact-matching this time or
        // someone else having resolved it since - so the stale pending row (if any) needs to clear
        // here, not just on a repeat "still unmatched" sync (recordPendingLibraryImport's upsert
        // only handles that half). Without this, a title that's now on the shelf would still show
        // up in the review queue as if it needed manual attention.
        await deletePendingLibraryImportByTitle(userId, PLAYNITE_SOURCE, entry.title);
        matched++;
      } catch (err) {
        // One entry failing to resolve/create shouldn't abort the batch - but it needs to be
        // findable afterward, not just counted (see this function's doc comment).
        errored++;
        logger.warn({ err, title: entry.title }, 'Playnite import entry failed');
      } finally {
        await setPlayniteImportProgress(userId, { consideredCount, matched, unmatched, errored, done: false });
      }
    }
    if (matched > 0) await invalidateExistingIgdbIds(null, userId);
  } finally {
    await setPlayniteImportProgress(userId, { consideredCount, matched, unmatched, errored, done: true });
  }
}

export default async function apiV1Routes(app: FastifyInstance) {
  // Scoped to this plugin instance only (Fastify's encapsulation model) - registering this hook
  // here, not on the top-level `app`, is what keeps bearer auth from ever applying to any
  // cookie-authenticated route registered outside this plugin.
  app.addHook('preHandler', async (request) => {
    request.apiKeyUserId = await resolveApiKeyUserId(request.headers.authorization);
  });

  app.get('/library', apiV1RateLimit, async (request) => {
    const userId = request.apiKeyUserId;
    const games = await prisma.game.findMany({
      where: { roomId: null, addedBy: userId, archivedAt: null },
      include: gameInclude,
      orderBy: { createdAt: 'desc' },
      take: MAX_LIBRARY_PULL,
    });
    return { games: await serializeGames(games, userId) };
  });

  app.post<{ Body: CreateGameRequest }>('/library/games', apiV1RateLimit, async (request, reply) => {
    const userId = request.apiKeyUserId;
    const { igdbId, status, ownedPlatforms } = request.body;
    const response = await createGameForUser(userId, null, igdbId, { status, ownedPlatforms });
    reply.status(201);
    return response;
  });

  app.get<{ Params: { roomId: string } }>('/rooms/:roomId/games', apiV1RateLimit, async (request) => {
    const userId = request.apiKeyUserId;
    const { roomId } = request.params;
    await requireMembership(roomId, userId);
    const games = await prisma.game.findMany({
      where: { roomId, archivedAt: null },
      include: gameInclude,
      orderBy: { createdAt: 'desc' },
      take: MAX_LIBRARY_PULL,
    });
    return { games: await serializeGames(games, userId) };
  });

  app.post<{ Params: { roomId: string }; Body: CreateGameRequest }>(
    '/rooms/:roomId/games',
    apiV1RateLimit,
    async (request, reply) => {
      const userId = request.apiKeyUserId;
      const { roomId } = request.params;
      const { igdbId, status } = request.body;
      // ownedPlatforms is a Personal Shelf-only concept (see createGameForUser) - a room push
      // never accepts it, same as the cookie-authenticated room add flow.
      const response = await createGameForUser(userId, roomId, igdbId, { status });
      reply.status(201);
      return response;
    },
  );

  app.post<{ Body: { entries: LibraryImportEntry[] } }>(
    '/library/import-playnite',
    playniteImportRateLimit,
    async (request, reply) => {
      const userId = request.apiKeyUserId;
      const rawEntries = request.body?.entries ?? [];
      if (rawEntries.length > MAX_PLAYNITE_IMPORT_ENTRIES) {
        throw new HttpError(400, `Too many entries (max ${MAX_PLAYNITE_IMPORT_ENTRIES} per import).`);
      }
      const entries = dedupeImportEntries(rawEntries);

      // Same reasoning as Steam import's acquireSteamImportLock: without this, a retried request
      // (or, more likely here, an overlapping run of a caller that fires on every Playnite launch)
      // starts a second run that independently decides the same not-yet-owned titles are new.
      if (!(await acquirePlayniteImportLock(userId))) {
        throw new HttpError(409, 'A Playnite import is already running for your account.');
      }

      try {
        const shelfGames = await prisma.game.findMany({
          where: { roomId: null, addedBy: userId },
          select: { igdbId: true, status: true },
        });
        const existingByIgdbId = new Map(shelfGames.map((g) => [g.igdbId, { status: g.status }]));

        const consideredCount = entries.length;
        await setPlayniteImportProgress(userId, { consideredCount, matched: 0, unmatched: 0, errored: 0, done: false });

        runPlayniteImportLoop(userId, entries, existingByIgdbId, consideredCount, request.log)
          .catch((err) => request.log.error({ err }, 'Playnite library import failed'))
          .finally(() => releasePlayniteImportLock(userId));

        reply.status(202);
        const started: PlayniteImportStarted = { consideredCount };
        return started;
      } catch (err) {
        await releasePlayniteImportLock(userId);
        throw err;
      }
    },
  );

  app.get('/library/import-playnite/progress', playniteImportProgressRateLimit, async (request) => {
    const userId = request.apiKeyUserId;
    const progress: PlayniteImportProgress | null = await getPlayniteImportProgress(userId);
    return { progress };
  });
}
