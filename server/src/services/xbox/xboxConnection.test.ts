import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 's'.repeat(32);

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  deleteMany: vi.fn(),
  redisSet: vi.fn(),
  redisGet: vi.fn(),
  redisDel: vi.fn(),
  getConfigValue: vi.fn(),
  startLibrarySync: vi.fn(),
  startDeviceCode: vi.fn(),
  pollDeviceCode: vi.fn(),
  getXboxSession: vi.fn(),
  sessionFromRefreshToken: vi.fn(),
  fetchXboxLibrary: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  prisma: { userXboxConnection: { findUnique: h.findUnique, upsert: h.upsert, update: h.update, delete: h.del, deleteMany: h.deleteMany } },
}));
vi.mock('../redisClient.js', () => ({ redis: { set: h.redisSet, get: h.redisGet, del: h.redisDel } }));
vi.mock('../../config/env.js', () => ({ env: { SESSION_SECRET: 's'.repeat(32), XBOX_CLIENT_ID: undefined } }));
vi.mock('../configResolver.js', () => ({ getConfigValue: h.getConfigValue }));
vi.mock('../librarySync.js', () => ({ startLibrarySync: h.startLibrarySync }));
vi.mock('./xboxLibrary.js', () => ({ fetchXboxLibrary: h.fetchXboxLibrary }));
vi.mock('./xboxAuth.js', async () => {
  const actual = await vi.importActual<typeof import('./xboxAuth.js')>('./xboxAuth.js');
  return { ...actual, startDeviceCode: h.startDeviceCode, pollDeviceCode: h.pollDeviceCode, getXboxSession: h.getXboxSession, sessionFromRefreshToken: h.sessionFromRefreshToken };
});

import { disconnectXbox, getXboxStatus, pollXboxConnect, startXboxConnect, syncXboxLibrary } from './xboxConnection.js';
import { XboxAuthError } from './xboxAuth.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';

const logger = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.getConfigValue.mockResolvedValue('client-1');
  h.redisSet.mockResolvedValue('OK');
});

describe('getXboxStatus', () => {
  it('reports linked state and never the token', async () => {
    h.findUnique.mockResolvedValue({ gamertag: 'Player One', lastSyncedAt: new Date('2026-10-05T00:00:00Z'), refreshTokenEncrypted: 'secret' });
    const s = await getXboxStatus('u1');
    expect(s).toEqual({ configured: true, connected: true, gamertag: 'Player One', lastSyncedAt: '2026-10-05T00:00:00.000Z' });
    expect(JSON.stringify(s)).not.toContain('secret');
  });

  it('says not configured when the server has no Xbox app', async () => {
    h.getConfigValue.mockResolvedValue(undefined);
    h.findUnique.mockResolvedValue(null);
    expect(await getXboxStatus('u1')).toEqual({ configured: false, connected: false, gamertag: null, lastSyncedAt: null });
  });
});

describe('startXboxConnect', () => {
  it('keeps the device code on the server and returns only the user code', async () => {
    h.startDeviceCode.mockResolvedValue({ deviceCode: 'dc-secret', userCode: 'ABCD', verificationUri: 'https://www.microsoft.com/link', expiresIn: 900, interval: 5 });
    const out = await startXboxConnect('u1');
    expect(out).toEqual({ userCode: 'ABCD', verificationUri: 'https://www.microsoft.com/link', expiresIn: 900, interval: 5 });
    expect(JSON.stringify(out)).not.toContain('dc-secret');
    expect(h.redisSet).toHaveBeenCalledWith('xbox-device-login:u1', JSON.stringify({ deviceCode: 'dc-secret', interval: 5 }), 'EX', 900);
  });

  it('refuses when the server has no Xbox app', async () => {
    h.getConfigValue.mockResolvedValue(undefined);
    await expect(startXboxConnect('u1')).rejects.toThrow('not set up');
    expect(h.startDeviceCode).not.toHaveBeenCalled();
  });
});

describe('pollXboxConnect', () => {
  beforeEach(() => h.redisGet.mockResolvedValue(JSON.stringify({ deviceCode: 'dc', interval: 5 })));

  it('stays pending until approved', async () => {
    h.pollDeviceCode.mockResolvedValue({ status: 'pending' });
    expect(await pollXboxConnect('u1')).toEqual({ status: 'pending' });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('stores the login encrypted once approved', async () => {
    h.pollDeviceCode.mockResolvedValue({ status: 'connected', accessToken: 'at', refreshToken: 'rt' });
    h.getXboxSession.mockResolvedValue({ authorization: 'x', xuid: '123', gamertag: 'Player One', refreshToken: 'rt-final' });
    expect(await pollXboxConnect('u1')).toEqual({ status: 'connected', gamertag: 'Player One' });
    const stored = h.upsert.mock.calls[0][0].create.refreshTokenEncrypted as string;
    expect(stored).not.toContain('rt-final');
    expect(decryptSetting(stored, SECRET)).toBe('rt-final');
    expect(h.upsert.mock.calls[0][0].create).toMatchObject({ userId: 'u1', xuid: '123', gamertag: 'Player One' });
    expect(h.redisDel).toHaveBeenCalledWith('xbox-device-login:u1');
  });

  it('reports an expired code, and a declined one, and clears the state', async () => {
    h.pollDeviceCode.mockResolvedValue({ status: 'declined' });
    expect(await pollXboxConnect('u1')).toEqual({ status: 'declined' });
    expect(h.redisDel).toHaveBeenCalled();
    h.redisGet.mockResolvedValue(null);
    expect(await pollXboxConnect('u1')).toEqual({ status: 'expired' });
  });

  it('drops the spent code and reports an Xbox Live refusal', async () => {
    h.pollDeviceCode.mockResolvedValue({ status: 'connected', accessToken: 'at', refreshToken: 'rt' });
    h.getXboxSession.mockRejectedValue(new XboxAuthError('This is a child account.'));
    await expect(pollXboxConnect('u1')).rejects.toMatchObject({ statusCode: 502, message: 'This is a child account.' });
    expect(h.redisDel).toHaveBeenCalledWith('xbox-device-login:u1');
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe('syncXboxLibrary', () => {
  const row = () => ({ userId: 'u1', gamertag: 'Player One', refreshTokenEncrypted: encryptSetting('rt-old', SECRET) });

  it('refreshes, keeps the rotated token, and starts matching the library', async () => {
    h.findUnique.mockResolvedValue(row());
    h.sessionFromRefreshToken.mockResolvedValue({ authorization: 'x', xuid: '123', gamertag: 'Player One', refreshToken: 'rt-new' });
    h.fetchXboxLibrary.mockResolvedValue([{ title: 'Halo', platforms: ['xbox_one'] }]);
    h.startLibrarySync.mockResolvedValue({ consideredCount: 1 });
    expect(await syncXboxLibrary('u1', logger)).toEqual({ consideredCount: 1 });
    expect(h.sessionFromRefreshToken).toHaveBeenCalledWith('client-1', 'rt-old');
    const rotated = h.update.mock.calls[0][0].data.refreshTokenEncrypted as string;
    expect(decryptSetting(rotated, SECRET)).toBe('rt-new');
    expect(h.startLibrarySync).toHaveBeenCalledWith('u1', expect.objectContaining({ source: 'xbox', syncSource: 'xbox' }), [{ title: 'Halo', platforms: ['xbox_one'] }], logger);
  });

  it('needs a linked account first', async () => {
    h.findUnique.mockResolvedValue(null);
    await expect(syncXboxLibrary('u1', logger)).rejects.toThrow('Link your Xbox account first');
  });

  it('removes a link whose login lapsed and asks the person to link again', async () => {
    h.findUnique.mockResolvedValue(row());
    h.sessionFromRefreshToken.mockRejectedValue(new XboxAuthError('Your Xbox link has expired.', true));
    await expect(syncXboxLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 409 });
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(h.startLibrarySync).not.toHaveBeenCalled();
  });

  it('removes a link it can no longer decrypt', async () => {
    h.findUnique.mockResolvedValue({ ...row(), refreshTokenEncrypted: encryptSetting('x', 'o'.repeat(32)) });
    await expect(syncXboxLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 409 });
    expect(h.del).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('keeps the link on a passing Xbox Live failure', async () => {
    h.findUnique.mockResolvedValue(row());
    h.sessionFromRefreshToken.mockRejectedValue(new XboxAuthError('Could not reach Microsoft.'));
    await expect(syncXboxLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 502 });
    expect(h.deleteMany).not.toHaveBeenCalled();
  });
});

describe('disconnectXbox', () => {
  it('deletes the stored login and any half-finished link', async () => {
    await disconnectXbox('u1');
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(h.redisDel).toHaveBeenCalledWith('xbox-device-login:u1');
  });
});
