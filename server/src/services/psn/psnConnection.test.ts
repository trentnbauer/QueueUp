import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 's'.repeat(32);
const NPSSO = 'a'.repeat(64);

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  deleteMany: vi.fn(),
  startLibrarySync: vi.fn(),
  exchangeNpsso: vi.fn(),
  refreshTokens: vi.fn(),
  fetchPurchasedLibrary: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  prisma: { userPsnConnection: { findUnique: h.findUnique, upsert: h.upsert, update: h.update, delete: h.del, deleteMany: h.deleteMany } },
}));
vi.mock('../../config/env.js', () => ({ env: { SESSION_SECRET: 's'.repeat(32) } }));
vi.mock('../librarySync.js', () => ({ startLibrarySync: h.startLibrarySync }));
vi.mock('./psnLibrary.js', () => ({ fetchPurchasedLibrary: h.fetchPurchasedLibrary }));
vi.mock('./psnAuth.js', async () => {
  const actual = await vi.importActual<typeof import('./psnAuth.js')>('./psnAuth.js');
  return { ...actual, exchangeNpsso: h.exchangeNpsso, refreshTokens: h.refreshTokens };
});

import { connectPsn, disconnectPsn, getPsnStatus, syncPsnLibrary } from './psnConnection.js';
import { PsnAuthError } from './psnAuth.js';
import { decryptSetting, encryptSetting } from '../settingsCrypto.js';

const logger = {} as never;
const expires = new Date('2026-12-04T00:00:00Z');

beforeEach(() => vi.clearAllMocks());

describe('getPsnStatus', () => {
  it('reports the link and when it expires, never the token', async () => {
    h.findUnique.mockResolvedValue({ refreshTokenEncrypted: 'secret', refreshExpiresAt: expires, lastSyncedAt: new Date('2026-10-05T00:00:00Z') });
    const s = await getPsnStatus('u1');
    expect(s).toEqual({ connected: true, lastSyncedAt: '2026-10-05T00:00:00.000Z', linkExpiresAt: '2026-12-04T00:00:00.000Z' });
    expect(JSON.stringify(s)).not.toContain('secret');
  });

  it('reports nothing linked', async () => {
    h.findUnique.mockResolvedValue(null);
    expect(await getPsnStatus('u1')).toEqual({ connected: false, lastSyncedAt: null, linkExpiresAt: null });
  });
});

describe('connectPsn', () => {
  it('trades the NPSSO for a login and stores only the encrypted refresh token', async () => {
    h.exchangeNpsso.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt-secret', refreshExpiresAt: expires });
    h.findUnique.mockResolvedValue({ refreshTokenEncrypted: 'x', refreshExpiresAt: expires, lastSyncedAt: null });
    await connectPsn('u1', `  ${NPSSO}  `);
    expect(h.exchangeNpsso).toHaveBeenCalledWith(NPSSO);
    const create = h.upsert.mock.calls[0][0].create as { userId: string; refreshTokenEncrypted: string; refreshExpiresAt: Date };
    expect(create.refreshTokenEncrypted).not.toContain('rt-secret');
    expect(decryptSetting(create.refreshTokenEncrypted, SECRET)).toBe('rt-secret');
    expect(create.refreshExpiresAt).toEqual(expires);
    expect(JSON.stringify(h.upsert.mock.calls)).not.toContain(NPSSO);
  });

  it('rejects something that is not an NPSSO without calling Sony', async () => {
    await expect(connectPsn('u1', 'short')).rejects.toMatchObject({ statusCode: 400 });
    await expect(connectPsn('u1', undefined)).rejects.toMatchObject({ statusCode: 400 });
    expect(h.exchangeNpsso).not.toHaveBeenCalled();
  });

  it('reports a code Sony rejects as the person\'s to fix, and an outage as Sony\'s', async () => {
    h.exchangeNpsso.mockRejectedValue(new PsnAuthError('PlayStation did not accept that code.', true));
    await expect(connectPsn('u1', NPSSO)).rejects.toMatchObject({ statusCode: 400 });
    h.exchangeNpsso.mockRejectedValue(new PsnAuthError('Could not reach PlayStation.'));
    await expect(connectPsn('u1', NPSSO)).rejects.toMatchObject({ statusCode: 502 });
    expect(h.upsert).not.toHaveBeenCalled();
  });
});

describe('syncPsnLibrary', () => {
  const row = () => ({ userId: 'u1', refreshTokenEncrypted: encryptSetting('rt-old', SECRET), refreshExpiresAt: expires });

  it('refreshes, keeps the rotated token, and starts matching the library', async () => {
    h.findUnique.mockResolvedValue(row());
    h.refreshTokens.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt-new', refreshExpiresAt: expires });
    h.fetchPurchasedLibrary.mockResolvedValue([{ title: 'Returnal', platforms: ['ps5'] }]);
    h.startLibrarySync.mockResolvedValue({ consideredCount: 1 });
    expect(await syncPsnLibrary('u1', logger)).toEqual({ consideredCount: 1 });
    expect(h.refreshTokens).toHaveBeenCalledWith('rt-old');
    expect(decryptSetting(h.update.mock.calls[0][0].data.refreshTokenEncrypted, SECRET)).toBe('rt-new');
    expect(h.fetchPurchasedLibrary).toHaveBeenCalledWith('at');
    expect(h.startLibrarySync).toHaveBeenCalledWith('u1', expect.objectContaining({ source: 'psn', syncSource: 'psn' }), [{ title: 'Returnal', platforms: ['ps5'] }], logger);
  });

  it('needs a linked account first', async () => {
    h.findUnique.mockResolvedValue(null);
    await expect(syncPsnLibrary('u1', logger)).rejects.toThrow('Link your PlayStation account first');
  });

  it('removes a link whose login lapsed and asks the person to link again', async () => {
    h.findUnique.mockResolvedValue(row());
    h.refreshTokens.mockRejectedValue(new PsnAuthError('Your PlayStation link has expired.', true));
    await expect(syncPsnLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 409 });
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(h.startLibrarySync).not.toHaveBeenCalled();
  });

  it('removes a link it can no longer decrypt', async () => {
    h.findUnique.mockResolvedValue({ ...row(), refreshTokenEncrypted: encryptSetting('x', 'o'.repeat(32)) });
    await expect(syncPsnLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 409 });
    expect(h.del).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('keeps the link on a passing Sony failure', async () => {
    h.findUnique.mockResolvedValue(row());
    h.refreshTokens.mockRejectedValue(new PsnAuthError('PlayStation is having problems right now.'));
    await expect(syncPsnLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 502 });
    expect(h.deleteMany).not.toHaveBeenCalled();
  });
});

describe('disconnectPsn', () => {
  it('deletes the stored login', async () => {
    await disconnectPsn('u1');
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});
