import type { FastifyBaseLogger } from 'fastify';
import type { RetroAchievementsStatusResponse } from '@queueup/shared';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../util/httpError.js';
import { startLibrarySync, type LibrarySyncSource } from '../librarySync.js';
import { assertNotLimited, markLimited } from '../librarySyncLimits.js';
import { notifyLibrarySyncError } from '../notifications.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';
import { fetchLibrary, RetroAchievementsError, verifyAccount } from './raClient.js';

/** The person-facing side of the RetroAchievements sync: link a username and web API key, then sync
 * the games on the profile. The key is a credential, so it is encrypted with a key derived from
 * SESSION_SECRET (see settingsCrypto.ts), never sent to the client, and decrypted only in memory for
 * a call. Games go through the same matching, shelf and needs-matching code as the other syncs (see
 * librarySync.ts); ones the person has beaten or mastered become completion suggestions to approve.
 * Loaded lazily so this module stays importable without a parsed env (its unit tests). */
async function getSecret(): Promise<string> {
  return (await import('../../config/env.js')).env.SESSION_SECRET;
}

export const RETROACHIEVEMENTS_SOURCE: LibrarySyncSource = { source: 'retroachievements', syncSource: 'retroachievements', label: 'Your RetroAchievements sync' };

/** A key RetroAchievements rejected is the person's to fix (400 when linking, 409 on a later sync);
 * anything else is RetroAchievements' problem (502). */
function asHttpError(err: unknown, relinkStatus = 409): never {
  if (err instanceof RetroAchievementsError) throw new HttpError(err.needsRelink ? relinkStatus : 502, err.message);
  throw err;
}

export async function getRetroAchievementsStatus(userId: string): Promise<RetroAchievementsStatusResponse> {
  const row = await prisma.userRetroAchievementsConnection.findUnique({ where: { userId } });
  return { connected: !!row, username: row?.username ?? null, lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null };
}

/** Links an account after checking the username and key work. */
export async function connectRetroAchievements(userId: string, username: unknown, apiKey: unknown): Promise<RetroAchievementsStatusResponse> {
  const name = typeof username === 'string' ? username.trim() : '';
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!name || name.length > 60 || !/^[\w.\- ]+$/.test(name)) throw new HttpError(400, 'Enter your RetroAchievements username');
  if (!/^[A-Za-z0-9]{16,64}$/.test(key)) throw new HttpError(400, 'Enter the Web API key from your RetroAchievements settings (letters and numbers only)');

  try {
    await verifyAccount({ username: name, apiKey: key });
  } catch (err) {
    return asHttpError(err, 400);
  }
  const apiKeyEncrypted = encryptSetting(key, await getSecret());
  await prisma.userRetroAchievementsConnection.upsert({
    where: { userId },
    create: { userId, username: name, apiKeyEncrypted },
    update: { username: name, apiKeyEncrypted, lastSyncedAt: null },
  });
  return getRetroAchievementsStatus(userId);
}

export async function disconnectRetroAchievements(userId: string): Promise<void> {
  await prisma.userRetroAchievementsConnection.deleteMany({ where: { userId } });
}

/** Reads the profile's games and starts matching them onto the shelf in the background. */
export async function syncRetroAchievementsLibrary(userId: string, logger: FastifyBaseLogger): Promise<{ consideredCount: number }> {
  const row = await prisma.userRetroAchievementsConnection.findUnique({ where: { userId } });
  if (!row) throw new HttpError(400, 'Link your RetroAchievements account first.');

  const apiKey = decryptSetting(row.apiKeyEncrypted, await getSecret());
  if (apiKey === null) {
    await prisma.userRetroAchievementsConnection.delete({ where: { userId } });
    throw new HttpError(409, 'Your saved RetroAchievements key can no longer be read. Link your RetroAchievements account again.');
  }

  await assertNotLimited('retroachievements', 'RetroAchievements', userId);
  try {
    const entries = await fetchLibrary({ username: row.username, apiKey });
    const started = await startLibrarySync(userId, RETROACHIEVEMENTS_SOURCE, entries, logger);
    await prisma.userRetroAchievementsConnection.update({ where: { userId }, data: { lastSyncedAt: new Date() } });
    return started;
  } catch (err) {
    if (err instanceof RetroAchievementsError) {
      // A rejected key can't work again: drop the link so the person is asked for it afresh.
      if (err.needsRelink) await prisma.userRetroAchievementsConnection.deleteMany({ where: { userId } });
      if (err.rateLimited) await markLimited('retroachievements', userId);
      await notifyLibrarySyncError(userId, 'RetroAchievements', err.message);
    }
    return asHttpError(err);
  }
}
