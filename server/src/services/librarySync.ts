import type { FastifyBaseLogger } from 'fastify';
import { PLATFORM_SYNC_BADGE_KEY, type BadgeKey, type LibraryImportEntry, type LibrarySyncProgress, type RoomPlatform, type SyncSource } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { runWithConcurrency } from '../util/concurrency.js';
import { invalidateExistingIgdbIds } from './gameAccess.js';
import { unlockBadges } from './badges.js';
import { redis } from './redisClient.js';
import { notifyLibrarySyncError } from './notifications.js';
import { recordSyncSources } from './syncSources.js';
import { unionOwnedPlatforms } from './userSettings.js';
import { applyResolvedIgdbEntry, type ResolvedShelfGame } from './libraryImportShelf.js';
import { applyMatchRedirect } from './matchRedirects.js';
import { recordPlayniteCompletionSuggestion } from './playniteCompletionSuggestions.js';
import { flagAdultGamesAfterSync } from './adultSyncCheck.js';
import { deletePendingLibraryImportByTitle, recordPendingLibraryImport, resolveTitleToIgdbId } from './playniteImport.js';

/** Runs a native library sync (Xbox now, PlayStation next) for one person: takes the entries a
 * store reported, matches each title to an IGDB game, puts it on the Personal Shelf with ownership
 * of the right platforms, and queues titles it can't match for the person to review. It is the
 * Playnite import loop (routes/apiV1.ts) minus Playnite's playtime feeds, sharing its matching,
 * shelf and pending-queue code. Runs in the background with a Redis progress row to poll, since a
 * big library is a lot of IGDB lookups and a reverse proxy won't hold a request open that long. */

export interface LibrarySyncSource {
  /** The TitleMatchAlias / PendingLibraryImport source, e.g. "xbox". */
  source: string;
  /** What the shelf's sync badge shows for games this sync saw. */
  syncSource: SyncSource;
  /** Names this sync in the "we ticked a system you own" message, e.g. "Your Xbox sync". */
  label: string;
}

// Bounded the same way as the Playnite import (see PLAYNITE_IMPORT_CONCURRENCY in routes/apiV1.ts):
// not a hard rate guarantee, a compromise that keeps one sync well clear of IGDB's per-key limit.
const SYNC_CONCURRENCY = 4;
const LOCK_TTL_SECONDS = 60 * 30;
const PROGRESS_TTL_SECONDS = 60 * 30;

const lockKey = (source: string, userId: string) => `library-sync-lock:${source}:${userId}`;
const progressKey = (source: string, userId: string) => `library-sync-progress:${source}:${userId}`;

export async function setLibrarySyncProgress(source: string, userId: string, progress: LibrarySyncProgress): Promise<void> {
  await redis.set(progressKey(source, userId), JSON.stringify(progress), 'EX', PROGRESS_TTL_SECONDS);
  // A run still making progress keeps its lock alive, so a library big enough to outlast the TTL
  // can't have a second sync start on top of it.
  if (!progress.done) await redis.expire(lockKey(source, userId), LOCK_TTL_SECONDS);
}

export async function getLibrarySyncProgress(source: string, userId: string): Promise<LibrarySyncProgress | null> {
  const cached = await redis.get(progressKey(source, userId));
  return cached ? (JSON.parse(cached) as LibrarySyncProgress) : null;
}

/** Starts a sync in the background and returns how many titles it will look at. Throws a 409 when
 * one is already running for this person (two overlapping runs could each decide the same title is
 * new and both create it). */
export async function startLibrarySync(
  userId: string,
  src: LibrarySyncSource,
  entries: LibraryImportEntry[],
  logger: FastifyBaseLogger,
): Promise<{ consideredCount: number }> {
  if ((await redis.set(lockKey(src.source, userId), '1', 'EX', LOCK_TTL_SECONDS, 'NX')) !== 'OK') {
    throw new HttpError(409, 'A sync is already running for your account.');
  }
  try {
    const shelfGames = await prisma.game.findMany({ where: { roomId: null, addedBy: userId }, select: { id: true, igdbId: true, status: true } });
    const existingByIgdbId = new Map<number, ResolvedShelfGame>(shelfGames.map((g) => [g.igdbId, { id: g.id, status: g.status }]));
    const startedAt = new Date().toISOString();
    await setLibrarySyncProgress(src.source, userId, { startedAt, consideredCount: entries.length, matched: 0, unmatched: 0, errored: 0, done: false });

    void runLibrarySync(userId, src, entries, existingByIgdbId, startedAt, logger)
      .catch(async (err) => {
        logger.error({ err }, `${src.source} library sync failed`);
        await notifyLibrarySyncError(userId, src.label.replace(/^Your /, '').replace(/ sync$/, ''), 'something went wrong part-way through. Try again.');
      })
      .finally(() => redis.del(lockKey(src.source, userId)).catch(() => undefined));
    return { consideredCount: entries.length };
  } catch (err) {
    await redis.del(lockKey(src.source, userId)).catch(() => undefined);
    throw err;
  }
}

async function runLibrarySync(
  userId: string,
  src: LibrarySyncSource,
  entries: LibraryImportEntry[],
  existingByIgdbId: Map<number, ResolvedShelfGame>,
  startedAt: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  const consideredCount = entries.length;
  let matched = 0;
  let unmatched = 0;
  let errored = 0;
  const touchedPlatformFamilies = new Set<BadgeKey>();
  const seenPlatforms = new Set<RoomPlatform>();
  const matchedIgdbIds: number[] = [];
  try {
    await runWithConcurrency(entries, SYNC_CONCURRENCY, async (entry) => {
      try {
        const resolvedIgdbId = await resolveTitleToIgdbId(src.source, entry.title, userId);
        // A game the person merged into another (issue #814) syncs as that one, not as a new duplicate.
        const igdbId = resolvedIgdbId === null ? null : await applyMatchRedirect(userId, resolvedIgdbId);
        if (igdbId === null) {
          await recordPendingLibraryImport(userId, src.source, entry.title, entry.platforms);
          unmatched++;
          return;
        }
        const shelfGame = await applyResolvedIgdbEntry(userId, igdbId, entry, existingByIgdbId);
        // A store that says the game is finished (RetroAchievements beaten/mastered) becomes a
        // suggestion to mark it Beaten, never an automatic change. Best effort: it must not turn a
        // matched game into an errored one.
        if (entry.isCompleted) {
          try {
            await recordPlayniteCompletionSuggestion(userId, shelfGame.id, shelfGame.status);
          } catch (feedErr) {
            logger.warn({ err: feedErr, title: entry.title }, `${src.source} completion suggestion failed`);
          }
        }
        for (const platform of entry.platforms) {
          const key = PLATFORM_SYNC_BADGE_KEY[platform];
          if (key) touchedPlatformFamilies.add(key);
          seenPlatforms.add(platform);
        }
        // A title that was waiting in the review queue may resolve now; clear its stale row.
        await deletePendingLibraryImportByTitle(userId, src.source, entry.title);
        matched++;
        matchedIgdbIds.push(igdbId);
      } catch (err) {
        errored++;
        logger.warn({ err, title: entry.title }, `${src.source} sync entry failed`);
      } finally {
        // A failed progress write is a display hiccup, not a reason to abort the batch.
        await setLibrarySyncProgress(src.source, userId, { startedAt, consideredCount, matched, unmatched, errored, done: false }).catch((progressErr) =>
          logger.warn({ err: progressErr }, `Failed to write ${src.source} sync progress`),
        );
      }
    });
    if (matched > 0) await invalidateExistingIgdbIds(null, userId);
    await recordSyncSources(userId, matchedIgdbIds, src.syncSource);
    if (seenPlatforms.size > 0) await unionOwnedPlatforms(userId, [...seenPlatforms], src.label);
    // Adult games the sync brought in: one notification (or hidden automatically) - see adultSyncCheck.ts.
    void flagAdultGamesAfterSync(userId, matchedIgdbIds);
  } finally {
    const unlockedBadges = touchedPlatformFamilies.size > 0 ? await unlockBadges(userId, [...touchedPlatformFamilies]).catch(() => []) : [];
    await setLibrarySyncProgress(src.source, userId, { startedAt, consideredCount, matched, unmatched, errored, done: true, unlockedBadges });
  }
}
