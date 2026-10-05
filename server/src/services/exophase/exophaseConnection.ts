import type { FastifyBaseLogger } from 'fastify';
import type { ExophaseStatusResponse } from '@queueup/shared';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../util/httpError.js';
import { startLibrarySync, type LibrarySyncSource } from '../librarySync.js';
import { ExophaseError, fetchGamesPage, fetchLibrary, resolvePlayerId } from './exophaseClient.js';

/** The person-facing side of the Exophase sync: link a public Exophase profile, then sync it. There
 * is nothing secret here (a profile id is visible in the profile page's source), so it is stored as
 * is. The library goes through the same matching, shelf and needs-matching code as the Xbox and
 * Playnite imports (see librarySync.ts). */

export const EXOPHASE_SOURCE: LibrarySyncSource = { source: 'exophase', syncSource: 'exophase', label: 'Your Exophase sync' };

/** An Exophase problem becomes a 400 when the person can fix it (wrong or private profile) and a 502
 * when the site is the problem. */
function asHttpError(err: unknown, status = 502): never {
  if (err instanceof ExophaseError) throw new HttpError(status, err.message);
  throw err;
}

export async function getExophaseStatus(userId: string): Promise<ExophaseStatusResponse> {
  const row = await prisma.userExophaseConnection.findUnique({ where: { userId } });
  return { connected: !!row, playerId: row?.playerId ?? null, lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null };
}

/** Links a profile after checking it exists and has games to read. */
export async function connectExophase(userId: string, profile: unknown): Promise<ExophaseStatusResponse> {
  if (typeof profile !== 'string' || !profile.trim()) throw new HttpError(400, 'Enter your Exophase profile link, profile name or player id');
  let playerId: string;
  try {
    playerId = await resolvePlayerId(profile);
    // The first page doubles as a check that the profile exists and is public.
    if (!(await fetchGamesPage(playerId, 1))) {
      throw new ExophaseError('No games found on that Exophase profile. Check the profile is public and has games.');
    }
  } catch (err) {
    // A profile that can't be read is something the person can fix; a blocked or broken site is not.
    const fixable = err instanceof ExophaseError && !/blocking|problems|Could not reach/.test(err.message);
    return asHttpError(err, fixable ? 400 : 502);
  }
  await prisma.userExophaseConnection.upsert({
    where: { userId },
    create: { userId, playerId },
    update: { playerId, lastSyncedAt: null },
  });
  return getExophaseStatus(userId);
}

export async function disconnectExophase(userId: string): Promise<void> {
  await prisma.userExophaseConnection.deleteMany({ where: { userId } });
}

/** Reads the linked profile's library and starts matching it onto the shelf in the background. */
export async function syncExophaseLibrary(userId: string, logger: FastifyBaseLogger): Promise<{ consideredCount: number }> {
  const row = await prisma.userExophaseConnection.findUnique({ where: { userId } });
  if (!row) throw new HttpError(400, 'Link your Exophase profile first.');
  try {
    const entries = await fetchLibrary(row.playerId);
    const started = await startLibrarySync(userId, EXOPHASE_SOURCE, entries, logger);
    await prisma.userExophaseConnection.update({ where: { userId }, data: { lastSyncedAt: new Date() } });
    return started;
  } catch (err) {
    return asHttpError(err);
  }
}
