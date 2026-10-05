import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  startLibrarySync: vi.fn(),
  resolvePlayerId: vi.fn(),
  fetchGamesPage: vi.fn(),
  fetchLibrary: vi.fn(),
  notifyLibrarySyncError: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({ prisma: { userExophaseConnection: { findUnique: h.findUnique, upsert: h.upsert, update: h.update, deleteMany: h.deleteMany } } }));
vi.mock('../librarySync.js', () => ({ startLibrarySync: h.startLibrarySync }));
vi.mock('../notifications.js', () => ({ notifyLibrarySyncError: h.notifyLibrarySyncError }));
vi.mock('./exophaseClient.js', async () => {
  const actual = await vi.importActual<typeof import('./exophaseClient.js')>('./exophaseClient.js');
  return { ...actual, resolvePlayerId: h.resolvePlayerId, fetchGamesPage: h.fetchGamesPage, fetchLibrary: h.fetchLibrary };
});

import { connectExophase, disconnectExophase, getExophaseStatus, syncExophaseLibrary } from './exophaseConnection.js';
import { ExophaseError } from './exophaseClient.js';

const logger = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.findUnique.mockResolvedValue({ playerId: '555', lastSyncedAt: new Date('2026-10-05T00:00:00Z') });
});

describe('getExophaseStatus', () => {
  it('reports the linked profile', async () => {
    expect(await getExophaseStatus('u1')).toEqual({ connected: true, playerId: '555', lastSyncedAt: '2026-10-05T00:00:00.000Z' });
  });

  it('reports nothing linked', async () => {
    h.findUnique.mockResolvedValue(null);
    expect(await getExophaseStatus('u1')).toEqual({ connected: false, playerId: null, lastSyncedAt: null });
  });
});

describe('connectExophase', () => {
  it('links a profile that exists and has games', async () => {
    h.resolvePlayerId.mockResolvedValue('555');
    h.fetchGamesPage.mockResolvedValue([{}]);
    await connectExophase('u1', 'https://www.exophase.com/user/Someone/');
    expect(h.upsert).toHaveBeenCalledWith({ where: { userId: 'u1' }, create: { userId: 'u1', playerId: '555' }, update: { playerId: '555', lastSyncedAt: null } });
  });

  it('asks for something when none is given', async () => {
    await expect(connectExophase('u1', '  ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(connectExophase('u1', undefined)).rejects.toMatchObject({ statusCode: 400 });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('reports a profile with no games or a private one as the person\'s to fix', async () => {
    h.resolvePlayerId.mockResolvedValue('555');
    h.fetchGamesPage.mockResolvedValue(null);
    await expect(connectExophase('u1', '555')).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('No games found') });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('reports an unreadable profile as fixable, and a blocked site as Exophase\'s problem', async () => {
    h.resolvePlayerId.mockRejectedValue(new ExophaseError('Could not read that profile.'));
    await expect(connectExophase('u1', 'name')).rejects.toMatchObject({ statusCode: 400 });
    h.resolvePlayerId.mockRejectedValue(new ExophaseError('Exophase is blocking requests from this server right now.'));
    await expect(connectExophase('u1', 'name')).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('syncExophaseLibrary', () => {
  it('reads the library and starts matching it, noting when it ran', async () => {
    h.fetchLibrary.mockResolvedValue([{ title: 'Hades', platforms: ['pc'] }]);
    h.startLibrarySync.mockResolvedValue({ consideredCount: 1 });
    expect(await syncExophaseLibrary('u1', logger)).toEqual({ consideredCount: 1 });
    expect(h.fetchLibrary).toHaveBeenCalledWith('555');
    expect(h.startLibrarySync).toHaveBeenCalledWith('u1', expect.objectContaining({ source: 'exophase', syncSource: 'exophase' }), [{ title: 'Hades', platforms: ['pc'] }], logger);
    expect(h.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { lastSyncedAt: expect.any(Date) } });
  });

  it('needs a linked profile first', async () => {
    h.findUnique.mockResolvedValue(null);
    await expect(syncExophaseLibrary('u1', logger)).rejects.toThrow('Link your Exophase profile first');
    expect(h.notifyLibrarySyncError).not.toHaveBeenCalled();
  });

  it('reports an Exophase failure without starting a sync', async () => {
    h.fetchLibrary.mockRejectedValue(new ExophaseError('Exophase is having problems right now.'));
    await expect(syncExophaseLibrary('u1', logger)).rejects.toMatchObject({ statusCode: 502 });
    expect(h.startLibrarySync).not.toHaveBeenCalled();
    expect(h.notifyLibrarySyncError).toHaveBeenCalledWith('u1', 'Exophase', 'Exophase is having problems right now.');
  });
});

describe('disconnectExophase', () => {
  it('removes the link', async () => {
    await disconnectExophase('u1');
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});
