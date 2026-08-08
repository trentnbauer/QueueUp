import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { redis } from './redisClient.js';
import { findIgdbIdByExactTitle, normalizeGameTitleForComparison, searchGames } from './igdbClient.js';
import type { GameSearchResult, PendingLibraryImportDto, PlayniteImportProgress, RoomPlatform } from '@queueup/shared';

/** Source label for every PendingLibraryImport/TitleMatchAlias row this service writes - free text
 * rather than an enum on those models (see their doc comments) so a future external-library source
 * doesn't need a migration, but this is the one place that string is decided for the Playnite
 * import path specifically. */
export const PLAYNITE_SOURCE = 'playnite';

const IMPORT_LOCK_TTL_SECONDS = 60 * 30; // covers the slowest realistic non-Steam library, well above one IGDB lookup per entry

function importLockKey(userId: string): string {
  return `playnite-import-lock:${userId}`;
}

/** Guards against two overlapping Playnite import runs for the same user - same reasoning as
 * Steam's acquireSteamImportLock/releaseSteamImportLock, and more likely to matter here: this
 * import is designed to be re-run repeatedly (a headless agent firing on every Playnite launch,
 * not a human clicking a button once), so overlapping runs are a real, not just theoretical, risk.
 * Without this, two overlapping runs can each decide the same not-yet-owned title is new and both
 * try to create it. Returns true if the lock was acquired (caller may proceed), false if another
 * import is already running - always pair a true result with releasePlayniteImportLock. */
export async function acquirePlayniteImportLock(userId: string): Promise<boolean> {
  const result = await redis.set(importLockKey(userId), '1', 'EX', IMPORT_LOCK_TTL_SECONDS, 'NX');
  return result === 'OK';
}

export async function releasePlayniteImportLock(userId: string): Promise<void> {
  await redis.del(importLockKey(userId));
}

const IMPORT_PROGRESS_TTL_SECONDS = 60 * 30;

function importProgressKey(userId: string): string {
  return `playnite-import-progress:${userId}`;
}

/** Written to as the import loop in routes/apiV1.ts processes each entry, and polled so a client
 * (the Playnite extension, or a future web view of the same sync) can show live counts instead of
 * a bare "Importing…" for however long the whole batch takes. Same shape/reasoning as
 * setSteamImportProgress/getSteamImportProgress. */
export async function setPlayniteImportProgress(userId: string, progress: PlayniteImportProgress): Promise<void> {
  await redis.set(importProgressKey(userId), JSON.stringify(progress), 'EX', IMPORT_PROGRESS_TTL_SECONDS);
}

export async function getPlayniteImportProgress(userId: string): Promise<PlayniteImportProgress | null> {
  const cached = await redis.get(importProgressKey(userId));
  return cached ? (JSON.parse(cached) as PlayniteImportProgress) : null;
}

/** Remembers a (source, title) -> igdbId mapping so a future resolveTitleToIgdbId call for the
 * same title - this user's next sync, or a completely different user's library reporting the exact
 * same title string - skips straight to the answer instead of re-running an IGDB search or landing
 * in the review queue again for a title someone already resolved. Called both on a successful
 * exact-title match (see resolveTitleToIgdbId) and when a person manually resolves a
 * PendingLibraryImport row (see resolvePendingLibraryImport) - either way is equally trustworthy
 * evidence of the right mapping. */
export async function recordTitleMatchAlias(source: string, title: string, igdbId: number): Promise<void> {
  const normalizedTitle = normalizeGameTitleForComparison(title);
  if (!normalizedTitle) return;
  await prisma.titleMatchAlias.upsert({
    where: { source_normalizedTitle: { source, normalizedTitle } },
    create: { source, normalizedTitle, igdbId },
    update: { igdbId },
  });
}

/** Resolves an external-library title to an igdbId: checks the crowd-sourced TitleMatchAlias cache
 * first (free - no IGDB call at all), then falls back to an exact IGDB title search
 * (findIgdbIdByExactTitle - deliberately not a fuzzy/best-guess match, same reasoning as that
 * function's own doc comment: a wrong auto-match silently corrupts the library, which is worse
 * than asking). A successful exact-title match is recorded as a fresh alias too, so the next call
 * for the same title - from this user's next sync or anyone else's - is free. */
export async function resolveTitleToIgdbId(source: string, title: string): Promise<number | null> {
  const normalizedTitle = normalizeGameTitleForComparison(title);
  if (!normalizedTitle) return null;

  const alias = await prisma.titleMatchAlias.findUnique({ where: { source_normalizedTitle: { source, normalizedTitle } } });
  if (alias) return alias.igdbId;

  const igdbId = await findIgdbIdByExactTitle(title);
  if (igdbId !== null) {
    await recordTitleMatchAlias(source, title, igdbId);
  }
  return igdbId;
}

/** Creates or refreshes a PendingLibraryImport row for a title that didn't resolve to an igdbId -
 * upserted on (userId, source, title) (see the model's unique constraint) so a repeat sync of the
 * same still-unresolved title updates the existing row instead of accumulating a duplicate; without
 * this, a user syncing on every Playnite launch would see their review queue grow without bound
 * purely from re-imports of titles they haven't gotten around to reviewing yet. Snapshots IGDB
 * search candidates at write time (capped at 5 - plenty to eyeball, keeps the row small) rather
 * than searching fresh when the review UI loads.
 *
 * Bails out before touching IGDB at all if the user already dismissed this exact title
 * (PendingLibraryImport.dismissedAt) - see #589. dismissPendingLibraryImport keeps the row around
 * instead of deleting it precisely so this check has something to find; without it, a dismissed
 * row simply wouldn't exist anymore, this function would treat that title as brand new on the very
 * next sync, and the upsert's `create:` branch would resurrect exactly what the user dismissed. */
export async function recordPendingLibraryImport(userId: string, source: string, title: string, platforms: RoomPlatform[]): Promise<void> {
  const existing = await prisma.pendingLibraryImport.findUnique({ where: { userId_source_title: { userId, source, title } } });
  if (existing?.dismissedAt) return;

  const page = await searchGames(title);
  const candidates = page.results.slice(0, 5);
  await prisma.pendingLibraryImport.upsert({
    where: { userId_source_title: { userId, source, title } },
    create: { userId, source, title, platforms, candidates: candidates as unknown as Prisma.InputJsonValue },
    update: { platforms, candidates: candidates as unknown as Prisma.InputJsonValue },
  });
}

/** Excludes dismissed rows (see dismissPendingLibraryImport) - this backs both the review list
 * itself and the "Needs Review (N)" sidebar badge count, and a dismissed row is exactly the set of
 * things the user already said they don't want to see here again. */
export async function listPendingLibraryImports(userId: string): Promise<PendingLibraryImportDto[]> {
  const rows = await prisma.pendingLibraryImport.findMany({ where: { userId, dismissedAt: null }, orderBy: { createdAt: 'desc' } });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    platforms: row.platforms,
    source: row.source,
    candidates: row.candidates as unknown as GameSearchResult[],
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Deletes a PendingLibraryImport row once it's been acted on - resolved (see gameIntake.ts'
 * resolvePendingLibraryImport, called from the route) or explicitly dismissed by the user. Scoped
 * to userId so one user can't delete another's pending row by guessing an id. No-ops (rather than
 * 404ing) if the row is already gone - the caller's desired end state ("this row shouldn't exist")
 * is achieved either way, and a double-dismiss/double-resolve race shouldn't be an error. */
export async function deletePendingLibraryImport(userId: string, id: string): Promise<void> {
  await prisma.pendingLibraryImport.deleteMany({ where: { id, userId } });
}

/** Marks a PendingLibraryImport row dismissed (issue #589) rather than deleting it - used by the
 * DELETE /api/library/pending-imports/:id route for the "dismiss without resolving" action, as
 * opposed to deletePendingLibraryImport above which is for rows that are genuinely done (resolved,
 * or auto-resolved elsewhere). Keeping the row around is the whole point: it's what lets
 * recordPendingLibraryImport recognize "the user already dismissed this exact title" on the next
 * sync and skip re-creating it, instead of the title silently coming back. Scoped to userId (via
 * updateMany, not update) so one user can't dismiss another's row by guessing an id, and no-ops
 * (rather than 404ing) if the row is already gone or already dismissed - same reasoning as
 * deletePendingLibraryImport's own doc comment. */
export async function dismissPendingLibraryImport(userId: string, id: string): Promise<void> {
  await prisma.pendingLibraryImport.updateMany({ where: { id, userId }, data: { dismissedAt: new Date() } });
}

/** Clears a pending row (if any) once its title resolves on its own during a later import run -
 * via a freshly-written TitleMatchAlias, whether from this exact title matching this time or a
 * completely different user having resolved it since. Without this, a title that's now on the
 * shelf would still show up in the review queue looking like it needs manual attention. No-ops if
 * there's no pending row for this title, which is the common case. */
export async function deletePendingLibraryImportByTitle(userId: string, source: string, title: string): Promise<void> {
  await prisma.pendingLibraryImport.deleteMany({ where: { userId, source, title } });
}
