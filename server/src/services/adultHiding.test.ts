import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { user: { findUnique: m.findUnique }, game: { updateMany: m.updateMany } } }));

import { autoHideWaitingAdultGames } from './adultHiding.js';

beforeEach(() => vi.clearAllMocks());

describe('autoHideWaitingAdultGames', () => {
  it('does nothing when the setting is off', async () => {
    m.findUnique.mockResolvedValue({ autoHideAdult: false });
    expect(await autoHideWaitingAdultGames('u1')).toBe(0);
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown user', async () => {
    m.findUnique.mockResolvedValue(null);
    expect(await autoHideWaitingAdultGames('nobody')).toBe(0);
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('hides the person\'s own waiting adult shelf games and marks them answered when it is on', async () => {
    m.findUnique.mockResolvedValue({ autoHideAdult: true });
    m.updateMany.mockResolvedValue({ count: 3 });
    expect(await autoHideWaitingAdultGames('u1')).toBe(3);
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { roomId: null, addedBy: 'u1', sensitiveContent: true, sensitivePrompted: false, hiddenFromOthers: false, archivedAt: null },
      data: { hiddenFromOthers: true, sensitivePrompted: true },
    });
  });
});
