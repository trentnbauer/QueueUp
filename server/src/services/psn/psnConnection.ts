import type { FastifyBaseLogger } from 'fastify';
import type { PsnStatusResponse } from '@queueup/shared';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../util/httpError.js';
import { startLibrarySync, type LibrarySyncSource } from '../librarySync.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';
import { exchangeNpsso, isValidNpsso, PsnAuthError, refreshTokens } from './psnAuth.js';
import { fetchPurchasedLibrary } from './psnLibrary.js';

/** The person-facing side of the native PlayStation sync: link an account (a one-off NPSSO code),
 * keep the login, and sync the purchased games. The NPSSO is traded for tokens at once and never
 * stored; only the refresh token is kept, encrypted with a key derived from SESSION_SECRET (see
 * settingsCrypto.ts) and decrypted in memory for a sync. Loaded lazily so this module stays
 * importable without a parsed env (its unit tests). */
async function getSecret(): Promise<string> {
  return (await import('../../config/env.js')).env.SESSION_SECRET;
}

export const PSN_SOURCE: LibrarySyncSource = { source: 'psn', syncSource: 'psn', label: 'Your PlayStation sync' };

/** A lapsed login is a 409 (link again); anything else from Sony is a 502. */
function asHttpError(err: unknown): never {
  if (err instanceof PsnAuthError) throw new HttpError(err.needsRelink ? 409 : 502, err.message);
  throw err;
}

export async function getPsnStatus(userId: string): Promise<PsnStatusResponse> {
  const row = await prisma.userPsnConnection.findUnique({ where: { userId } });
  return {
    connected: !!row,
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
    linkExpiresAt: row?.refreshExpiresAt?.toISOString() ?? null,
  };
}

/** Links an account from a fresh NPSSO. */
export async function connectPsn(userId: string, npsso: unknown): Promise<PsnStatusResponse> {
  const code = typeof npsso === 'string' ? npsso.trim() : '';
  if (!isValidNpsso(code)) {
    throw new HttpError(400, 'That does not look like an NPSSO code. It is 64 letters and numbers, copied from the page the setup steps point to.');
  }
  let tokens;
  try {
    tokens = await exchangeNpsso(code);
  } catch (err) {
    // A code Sony rejects is the person's to fix (400), not a reason to say "link again".
    if (err instanceof PsnAuthError && err.needsRelink) throw new HttpError(400, err.message);
    return asHttpError(err);
  }
  const refreshTokenEncrypted = encryptSetting(tokens.refreshToken, await getSecret());
  await prisma.userPsnConnection.upsert({
    where: { userId },
    create: { userId, refreshTokenEncrypted, refreshExpiresAt: tokens.refreshExpiresAt },
    update: { refreshTokenEncrypted, refreshExpiresAt: tokens.refreshExpiresAt },
  });
  return getPsnStatus(userId);
}

export async function disconnectPsn(userId: string): Promise<void> {
  await prisma.userPsnConnection.deleteMany({ where: { userId } });
}

/** Reads the person's purchased PlayStation games and starts matching them onto their shelf. */
export async function syncPsnLibrary(userId: string, logger: FastifyBaseLogger): Promise<{ consideredCount: number }> {
  const row = await prisma.userPsnConnection.findUnique({ where: { userId } });
  if (!row) throw new HttpError(400, 'Link your PlayStation account first.');

  const secret = await getSecret();
  const refreshToken = decryptSetting(row.refreshTokenEncrypted, secret);
  if (refreshToken === null) {
    await prisma.userPsnConnection.delete({ where: { userId } });
    throw new HttpError(409, 'Your saved PlayStation link can no longer be read. Link your PlayStation account again.');
  }

  try {
    const tokens = await refreshTokens(refreshToken);
    // Sony rotates the refresh token; keep the new one or the next sync would fail.
    await prisma.userPsnConnection.update({
      where: { userId },
      data: { refreshTokenEncrypted: encryptSetting(tokens.refreshToken, secret), refreshExpiresAt: tokens.refreshExpiresAt ?? row.refreshExpiresAt },
    });
    const entries = await fetchPurchasedLibrary(tokens.accessToken);
    const started = await startLibrarySync(userId, PSN_SOURCE, entries, logger);
    await prisma.userPsnConnection.update({ where: { userId }, data: { lastSyncedAt: new Date() } });
    return started;
  } catch (err) {
    if (err instanceof PsnAuthError && err.needsRelink) await prisma.userPsnConnection.deleteMany({ where: { userId } });
    return asHttpError(err);
  }
}
