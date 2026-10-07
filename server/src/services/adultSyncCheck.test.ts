import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findMany: vi.fn(), update: vi.fn(), count: vi.fn(), steam: vi.fn(), notify: vi.fn(), autoHide: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { game: { findMany: m.findMany, update: m.update, count: m.count } } }));
vi.mock('./steamContent.js', () => ({ getSteamAdultOnly: m.steam }));
vi.mock('./notifications.js', () => ({ notifySensitiveGames: m.notify }));
vi.mock('./adultHiding.js', () => ({ autoHideWaitingAdultGames: m.autoHide }));

import { flagAdultGamesAfterSync } from './adultSyncCheck.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.findMany.mockResolvedValue([]);
  m.count.mockResolvedValue(0);
});

describe('flagAdultGamesAfterSync', () => {
  it('flags a synced game Steam marks adult, marks a clean one checked, and leaves one Steam did not answer for', async () => {
    m.findMany.mockResolvedValue([
      { id: 'adult', steamAppid: 1 },
      { id: 'clean', steamAppid: 2 },
      { id: 'unknown', steamAppid: 3 },
    ]);
    m.steam.mockImplementation(async (id: number) => (id === 1 ? true : id === 2 ? false : null));
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
