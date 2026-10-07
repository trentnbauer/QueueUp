import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findMany: vi.fn(), update: vi.fn(), count: vi.fn(), steam: vi.fn(), notify: vi.fn(), autoHide: vi.fn(), redisSet: vi.fn(), redisDel: vi.fn() }));
vi.mock('./redisClient.js', () => ({ redis: { set: m.redisSet, del: m.redisDel } }));
vi.mock('../db/client.js', () => ({ prisma: { game: { findMany: m.findMany, update: m.update, count: m.count } } }));
vi.mock('./adultSources.js', () => ({ adultOnlyFromSources: m.steam }));
vi.mock('./notifications.js', () => ({ notifySensitiveGames: m.notify }));
vi.mock('./adultHiding.js', () => ({ autoHideWaitingAdultGames: m.autoHide }));

import { flagAdultGamesAfterSync, scanLibraryForAdultGames } from './adultSyncCheck.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.findMany.mockResolvedValue([]);
  m.count.mockResolvedValue(0);
});

describe('flagAdultGamesAfterSync', () => {
  it('flags a synced game a source marks adult, marks a clean one checked, and leaves one a source did not answer for', async () => {
    m.findMany.mockResolvedValue([
      { id: 'adult', igdbId: 10, steamAppid: 1 },
      { id: 'clean', igdbId: 20, steamAppid: null }, // a console game: IGDB's rating is what is asked
      { id: 'unknown', igdbId: 30, steamAppid: 3 },
    ]);
    m.steam.mockImplementation(async (g: { igdbId: number }) => (g.igdbId === 10 ? true : g.igdbId === 20 ? false : null));
    await flagAdultGamesAfterSync('u1', [10, 20, 30]);
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'adult' }, data: { sensitiveContent: true } });
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'clean' }, data: { sensitiveAiChecked: true } });
    expect(m.update).toHaveBeenCalledTimes(2);
  });

  it('sends one notification with how many are waiting', async () => {
    m.count.mockResolvedValue(4);
    await flagAdultGamesAfterSync('u1', []);
    expect(m.notify).toHaveBeenCalledWith('u1', 4);
  });

  it('applies "automatically hide adult games" before it counts, so nothing is announced when it is on', async () => {
    const order: string[] = [];
    m.autoHide.mockImplementation(async () => void order.push('hide'));
    m.count.mockImplementation(async () => (order.push('count'), 0));
    await flagAdultGamesAfterSync('u1', []);
    expect(order).toEqual(['hide', 'count']);
    expect(m.notify).toHaveBeenCalledWith('u1', 0);
  });

  it('never throws into a sync', async () => {
    m.findMany.mockRejectedValue(new Error('db down'));
    await expect(flagAdultGamesAfterSync('u1', [1])).resolves.toBeUndefined();
  });
});

describe('scanLibraryForAdultGames', () => {
  const row = (id: string, igdbId: number) => ({ id, igdbId, steamAppid: null });

  beforeEach(() => {
    m.redisSet.mockResolvedValue('OK');
    m.redisDel.mockResolvedValue(1);
  });

  it('goes through the whole library page by page, then hides or notifies once, and releases its lock', async () => {
    m.findMany.mockResolvedValueOnce([row('a', 1), row('b', 2)]).mockResolvedValueOnce([row('c', 3)]).mockResolvedValueOnce([]);
    m.steam.mockImplementation(async (g: { igdbId: number }) => g.igdbId === 2);
    m.count.mockResolvedValue(1);
    expect(await scanLibraryForAdultGames('u1')).toBe(true);
    await vi.waitFor(() => expect(m.notify).toHaveBeenCalledWith('u1', 1));
    expect(m.findMany).toHaveBeenCalledTimes(3);
    // the second page starts after the first page's last id, so a game left unanswered is not asked for again and again
    expect(m.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'b' });
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { sensitiveContent: true } });
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { sensitiveAiChecked: true } });
    expect(m.autoHide).toHaveBeenCalledWith('u1');
    await vi.waitFor(() => expect(m.redisDel).toHaveBeenCalled());
  });

  it('does not start a second scan while one is running', async () => {
    m.redisSet.mockResolvedValue(null);
    expect(await scanLibraryForAdultGames('u1')).toBe(false);
    expect(m.findMany).not.toHaveBeenCalled();
  });

  it('releases its lock even when the scan fails', async () => {
    m.findMany.mockRejectedValue(new Error('db down'));
    expect(await scanLibraryForAdultGames('u1')).toBe(true);
    await vi.waitFor(() => expect(m.redisDel).toHaveBeenCalled());
  });
});
