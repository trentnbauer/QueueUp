import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 's'.repeat(32);
const KEY = 'k'.repeat(32);

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  deleteMany: vi.fn(),
  startLibrarySync: vi.fn(),
  verifyAccount: vi.fn(),
  fetchLibrary: vi.fn(),
  notifyLibrarySyncError: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  prisma: { userRetroAchievementsConnection: { findUnique: h.findUnique, upsert: h.upsert, update: h.update, delete: h.del, deleteMany: h.deleteMany } },
}));
vi.mock('../../config/env.js', () => ({ env: { SESSION_SECRET: 's'.repeat(32) } }));
vi.mock('../librarySync.js', () => ({ startLibrarySync: h.startLibrarySync }));
vi.mock('../notifications.js', () => ({ notifyLibrarySyncError: h.notifyLibrarySyncError }));
vi.mock('./raClient.js', async () => {
  const actual = await vi.importActual<typeof import('./raClient.js')>('./raClient.js');
  return { ...actual, verifyAccount: h.verifyAccount, fetchLibrary: h.fetchLibrary };
});

import { connectRetroAchievements, disconnectRetroAchievements, getRetroAchievementsStatus, syncRetroAchievementsLibrary } from './raConnection.js';
import { RetroAchievementsError } from './raClient.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';

const logger = {} as never;

beforeEach(() => vi.clearAllMocks());

describe('getRetroAchievementsStatus', () => {
  it('reports the link and never the key', async () => {
    h.findUnique.mockResolvedValue({ username: 'Player', apiKeyEncrypted: 'secret', lastSyncedAt: new Date('2026-10-05T00:00:00Z') });
    const s = await getRetroAchievementsStatus('u1');
    expect(s).toEqual({ connected: true, username: 'Player', lastSyncedAt: '2026-10-05T00:00:00.000Z' });
    expect(JSON.stringify(s)).not.toContain('secret');
  });

  it('reports nothing linked', async () => {
    h.findUnique.mockResolvedValue(null);
    expect(await getRetroAchievementsStatus('u1')).toEqual({ connected: false, username: null, lastSyncedAt: null });
  });
});

describe('connectRetroAchievements', () => {
  it('checks the account, then stores the key encrypted', async () => {
    h.verifyAccount.mockResolvedValue(10);
    h.findUnique.mockResolvedValue({ username: 'Player', lastSyncedAt: null });
    await connectRetroAchievements('u1', ' Player ', ` ${KEY} `);
    expect(h.verifyAccount).toHaveBeenCalledWith({ username: 'Player', apiKey: KEY });
    const create = h.upsert.mock.calls[0][0].create as { username: string; apiKeyEncrypted: string };
    expect(create.username).toBe('Player');
    expect(create.apiKeyEncrypted).not.toContain(KEY);
    expect(decryptSetting(create.apiKeyEncrypted, SECRET)).toBe(KEY);
  });

  it('rejects a missing username or a key of the wrong shape without calling out', async () => {
    await expect(connectRetroAchievements('u1', '', KEY)).rejects.toMatchObject({ statusCode: 400 });
    await expect(connectRetroAchievements('u1', 'Player', 'short')).rejects.toMatchObject({ statusCode: 400 });
    await expect(connectRetroAchievements('u1', 'Pla<yer>', KEY)).rejects.toMatchObject({ statusCode: 400 });
    await expect(connectRetroAchievements('u1', 'Player', undefined)).rejects.toMatchObject({ statusCode: 400 });
    expect(h.verifyAccount).not.toHaveBeenCalled();
  });

  it('reports a rejected key as the person\'s to fix and an outage as RetroAchievements\'', async () => {
    h.verifyAccount.mockRejectedValue(new RetroAchievementsError('RetroAchievements did not accept that username and key.', true));
    await expect(connectRetroAchievements('u1', 'Player', KEY)).rejects.toMatchObject({ statusCode: 400 });
    h.verifyAccount.mockRejectedValue(new RetroAchievementsError('RetroAchievements is having problems right now.'));
    await expect(connectRetroAchievements('u1', 'Player', KEY)).rejects.toMatchObject({ statusCode: 502 });
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe('syncRetroAchievementsLibrary', () => {
  const row = () => ({ userId: 'u1', username: 'Player', apiKeyEncrypted: encryptSetting(KEY, SECRET) });

  it('decrypts the key, reads the library and starts matching it', async () => {
    h.findUnique.mockResolvedValue(row());
    h.fetchLibrary.mockResolvedValue([{ title: 'Tetris', platforms: ['gb'], isCompleted: true }]);
    h.startLibrarySync.mockResolvedValue({ consideredCount: 1 });
    expect(await syncRetroAchievementsLibrary('u1', logger)).toEqual({ consideredCount: 1 });
    expect(h.fetchLibrary).toHaveBeenCalledWith({ username: 'Player', apiKey: KEY });
    expect(h.startLibrarySync).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ source: 'retroachievements', syncSource: 'retroachievements' }),
      [{ title: 'Tetris', platforms: ['gb'], isCompleted: true }],
      logger,
    );
    expect(h.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { lastSyncedAt: expect.any(Date) } });
  });

  it('needs a linked account first', async () => {
    h.findUnique.mockResolvedValue(null);
    await expect(syncRetroAchievementsLibrary('u1', logger)).rejects.toThrow('Link your RetroAchievements account first');
    expect(h.notifyLibrarySyncError).not.toHaveBeenCalled();
  });

  it('drops a link whose key was rejected, tells the person, and asks them to link again', async () => {
    h.findUnique.mockResolvedValue(row());
    h.fetchLibrary.mockRejectedValue(new RetroAchievementsError('RetroAchievements did not accept that username and key.', true));
    await expect(syncRetroAchievementsLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 409 });
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(h.notifyLibrarySyncError).toHaveBeenCalledWith('u1', 'RetroAchievements', 'RetroAchievements did not accept that username and key.');
  });

  it('keeps the link on a passing failure but still tells the person', async () => {
    h.findUnique.mockResolvedValue(row());
    h.fetchLibrary.mockRejectedValue(new RetroAchievementsError('RetroAchievements is having problems right now.'));
    await expect(syncRetroAchievementsLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 502 });
    expect(h.deleteMany).not.toHaveBeenCalled();
    expect(h.notifyLibrarySyncError).toHaveBeenCalledWith('u1', 'RetroAchievements', 'RetroAchievements is having problems right now.');
  });

  it('removes a key it can no longer decrypt', async () => {
    h.findUnique.mockResolvedValue({ ...row(), apiKeyEncrypted: encryptSetting(KEY, 'o'.repeat(32)) });
    await expect(syncRetroAchievementsLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 409 });
    expect(h.del).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

describe('disconnectRetroAchievements', () => {
  it('deletes the stored key', async () => {
    await disconnectRetroAchievements('u1');
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});
