import type { FastifyBaseLogger } from 'fastify';
import type { XboxConnectPollResponse, XboxConnectStartResponse, XboxStatusResponse } from '@queueup/shared';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../util/httpError.js';
import { getConfigValue } from '../configResolver.js';
import { redis } from '../redisClient.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';
import { startLibrarySync, type LibrarySyncSource } from '../librarySync.js';
import { notifyLibrarySyncError } from '../notifications.js';
import { getXboxSession, pollDeviceCode, sessionFromRefreshToken, startDeviceCode, XboxAuthError } from './xboxAuth.js';
import { fetchXboxLibrary } from './xboxLibrary.js';

/** The person-facing side of the native Xbox sync: link an account (device-code login), keep the
 * login, and sync the library. The Microsoft refresh token is stored encrypted with a key derived
 * from SESSION_SECRET (see settingsCrypto.ts) and is only ever decrypted in memory for a sync.
 * Loaded lazily so this module stays importable without a parsed env (its unit tests). */
async function getEnv() {
  return (await import('../../config/env.js')).env;
}

export const XBOX_SOURCE: LibrarySyncSource = { source: 'xbox', syncSource: 'xbox', label: 'Your Xbox sync' };

const deviceStateKey = (userId: string) => `xbox-device-login:${userId}`;

async function clientId(): Promise<string | undefined> {
  const env = await getEnv();
  return getConfigValue('XBOX_CLIENT_ID', env.XBOX_CLIENT_ID);
}

/** Turns an Xbox auth failure into an API error the person sees: a lapsed login is a 409 (link
 * again), anything else a 502 (Microsoft or Xbox Live had a problem). */
function asHttpError(err: unknown): never {
  if (err instanceof XboxAuthError) throw new HttpError(err.needsRelink ? 409 : 502, err.message);
  throw err;
}

export async function getXboxStatus(userId: string): Promise<XboxStatusResponse> {
  const [id, row] = await Promise.all([clientId(), prisma.userXboxConnection.findUnique({ where: { userId } })]);
  return {
    configured: !!id,
    connected: !!row,
    gamertag: row?.gamertag ?? null,
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
  };
}

/** Step one of linking: asks Microsoft for a code. The device code itself stays on the server (in
 * Redis until it expires); only the short user code and the link go to the person. */
export async function startXboxConnect(userId: string): Promise<XboxConnectStartResponse> {
  const id = await clientId();
  if (!id) throw new HttpError(400, 'Xbox sync is not set up on this server. Ask the administrator to add an Xbox app.');
  let code;
  try {
    code = await startDeviceCode(id);
  } catch (err) {
    asHttpError(err);
  }
  await redis.set(deviceStateKey(userId), JSON.stringify({ deviceCode: code.deviceCode, interval: code.interval }), 'EX', code.expiresIn);
  return { userCode: code.userCode, verificationUri: code.verificationUri, expiresIn: code.expiresIn, interval: code.interval };
}

/** Step two: asks Microsoft once whether the person has approved. When they have, finishes the
 * Xbox Live sign-in and stores the (encrypted) refresh token. Called repeatedly by the browser. */
export async function pollXboxConnect(userId: string): Promise<XboxConnectPollResponse> {
  const id = await clientId();
  if (!id) throw new HttpError(400, 'Xbox sync is not set up on this server.');
  const raw = await redis.get(deviceStateKey(userId));
  if (!raw) return { status: 'expired' };
  const { deviceCode } = JSON.parse(raw) as { deviceCode: string };

  try {
    const result = await pollDeviceCode(id, deviceCode);
    if (result.status === 'pending') return { status: 'pending' };
    if (result.status !== 'connected') {
      await redis.del(deviceStateKey(userId));
      return { status: result.status };
    }
    const session = await getXboxSession(result.accessToken, result.refreshToken);
    const refreshTokenEncrypted = encryptSetting(session.refreshToken, (await getEnv()).SESSION_SECRET);
    await prisma.userXboxConnection.upsert({
      where: { userId },
      create: { userId, xuid: session.xuid, gamertag: session.gamertag, refreshTokenEncrypted },
      update: { xuid: session.xuid, gamertag: session.gamertag, refreshTokenEncrypted },
    });
    await redis.del(deviceStateKey(userId));
    return { status: 'connected', gamertag: session.gamertag };
  } catch (err) {
    // The code is spent once Microsoft accepted it, so a failure after that means starting over.
    await redis.del(deviceStateKey(userId));
    return asHttpError(err);
  }
}

export async function disconnectXbox(userId: string): Promise<void> {
  await prisma.userXboxConnection.deleteMany({ where: { userId } });
  await redis.del(deviceStateKey(userId));
}

/** Reads the person's Xbox library and starts matching it onto their shelf in the background. */
export async function syncXboxLibrary(userId: string, logger: FastifyBaseLogger): Promise<{ consideredCount: number }> {
  const id = await clientId();
  if (!id) throw new HttpError(400, 'Xbox sync is not set up on this server.');
  const row = await prisma.userXboxConnection.findUnique({ where: { userId } });
  if (!row) throw new HttpError(400, 'Link your Xbox account first.');

  const env = await getEnv();
  const refreshToken = decryptSetting(row.refreshTokenEncrypted, env.SESSION_SECRET);
  if (refreshToken === null) {
    await prisma.userXboxConnection.delete({ where: { userId } });
    throw new HttpError(409, 'Your saved Xbox link can no longer be read. Link your Xbox account again.');
  }

  try {
    const session = await sessionFromRefreshToken(id, refreshToken);
    // Microsoft rotates the refresh token; keep the new one or the next sync would fail.
    await prisma.userXboxConnection.update({
      where: { userId },
      data: { refreshTokenEncrypted: encryptSetting(session.refreshToken, env.SESSION_SECRET), xuid: session.xuid, gamertag: session.gamertag ?? row.gamertag },
    });
    const entries = await fetchXboxLibrary(session);
    const started = await startLibrarySync(userId, XBOX_SOURCE, entries, logger);
    await prisma.userXboxConnection.update({ where: { userId }, data: { lastSyncedAt: new Date() } });
    return started;
  } catch (err) {
    if (err instanceof XboxAuthError && err.needsRelink) await prisma.userXboxConnection.deleteMany({ where: { userId } });
    if (err instanceof XboxAuthError) await notifyLibrarySyncError(userId, 'Xbox', err.message);
    return asHttpError(err);
  }
}
