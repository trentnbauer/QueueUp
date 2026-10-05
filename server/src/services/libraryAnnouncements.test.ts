import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ findSetting: vi.fn(), upsertSetting: vi.fn(), findUsers: vi.fn(), createMany: vi.fn() }));
vi.mock('../db/client.js', () => ({
  prisma: {
    appSetting: { findUnique: h.findSetting, upsert: h.upsertSetting },
    user: { findMany: h.findUsers },
    notification: { createMany: h.createMany },
  },
}));

import { announceNewLibrarySources, announcementMessage, LIBRARY_ANNOUNCEMENTS } from './libraryAnnouncements.js';

const logger = { info: vi.fn(), warn: vi.fn() };
const allIds = LIBRARY_ANNOUNCEMENTS.map((s) => s.id);

beforeEach(() => {
  vi.clearAllMocks();
  h.findSetting.mockResolvedValue(null);
  h.findUsers.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
});

describe('announcementMessage', () => {
  it('names one, two or several sources', () => {
    expect(announcementMessage([])).toBeNull();
    expect(announcementMessage(['Xbox'])).toBe('New ways to sync your library: Xbox. Open Libraries to link it.');
    expect(announcementMessage(['Xbox', 'PlayStation'])).toBe('New ways to sync your library: Xbox and PlayStation. Open Libraries to link one.');
    expect(announcementMessage(['Xbox', 'PlayStation', 'Exophase'])).toBe('New ways to sync your library: Xbox, PlayStation and Exophase. Open Libraries to link one.');
  });
});

describe('announceNewLibrarySources', () => {
  it('tells every existing user once and records what it announced', async () => {
    await announceNewLibrarySources(logger);
    const { data } = h.createMany.mock.calls[0][0] as { data: { recipientId: string; type: string; message: string }[] };
    expect(data.map((d) => d.recipientId)).toEqual(['u1', 'u2']);
    expect(data.every((d) => d.type === 'library_sync_available' && d.message.includes('Xbox') && d.message.includes('RetroAchievements'))).toBe(true);
    expect(JSON.parse(h.upsertSetting.mock.calls[0][0].create.value)).toEqual(allIds);
  });

  it('does nothing once every source has been announced, so a restart never repeats it', async () => {
    h.findSetting.mockResolvedValue({ value: JSON.stringify(allIds) });
    await announceNewLibrarySources(logger);
    expect(h.createMany).not.toHaveBeenCalled();
    expect(h.upsertSetting).not.toHaveBeenCalled();
  });

  it('announces only a source added since last time', async () => {
    h.findSetting.mockResolvedValue({ value: JSON.stringify(allIds.slice(0, -1)) });
    await announceNewLibrarySources(logger);
    const { data } = h.createMany.mock.calls[0][0] as { data: { message: string }[] };
    expect(data[0].message).toBe('New ways to sync your library: RetroAchievements. Open Libraries to link it.');
    expect(JSON.parse(h.upsertSetting.mock.calls[0][0].create.value)).toEqual(allIds);
  });

  it('just marks the sources announced on a server with no users', async () => {
    h.findUsers.mockResolvedValue([]);
    await announceNewLibrarySources(logger);
    expect(h.createMany).not.toHaveBeenCalled();
    expect(JSON.parse(h.upsertSetting.mock.calls[0][0].create.value)).toEqual(allIds);
  });

  it('records nothing when writing the notifications fails, so the next boot retries', async () => {
    h.createMany.mockRejectedValue(new Error('db down'));
    await announceNewLibrarySources(logger);
    expect(h.upsertSetting).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
