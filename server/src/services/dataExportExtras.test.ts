import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  xbox: vi.fn(),
  psn: vi.fn(),
  exophase: vi.fn(),
  ai: vi.fn(),
  rooms: vi.fn(),
  merged: vi.fn(),
}));
vi.mock('../db/client.js', () => ({
  prisma: {
    userXboxConnection: { findUnique: h.xbox },
    userPsnConnection: { findUnique: h.psn },
    userExophaseConnection: { findUnique: h.exophase },
    userAiSettings: { findUnique: h.ai },
    room: { findMany: h.rooms },
    gameMatchRedirect: { findMany: h.merged },
  },
}));

import { loadExportExtras } from './dataExportExtras.js';

const at = new Date('2026-10-05T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  h.xbox.mockResolvedValue(null);
  h.psn.mockResolvedValue(null);
  h.exophase.mockResolvedValue(null);
  h.ai.mockResolvedValue(null);
  h.rooms.mockResolvedValue([]);
  h.merged.mockResolvedValue([]);
});

describe('loadExportExtras', () => {
  it('is empty for someone with nothing set up', async () => {
    expect(await loadExportExtras('u1')).toEqual({ libraryLinks: [], aiSettings: null, roomsUsingYourAiKey: [], mergedGames: [] });
  });

  it('lists linked libraries without any login or token', async () => {
    h.xbox.mockResolvedValue({ gamertag: 'Player One', createdAt: at, lastSyncedAt: null, refreshTokenEncrypted: 'secret-xbox' });
    h.psn.mockResolvedValue({ createdAt: at, lastSyncedAt: at, refreshExpiresAt: new Date('2026-12-04T00:00:00Z'), refreshTokenEncrypted: 'secret-psn' });
    h.exophase.mockResolvedValue({ playerId: '555', createdAt: at, lastSyncedAt: null });
    const out = await loadExportExtras('u1');
    expect(out.libraryLinks).toEqual([
      { library: 'xbox', account: 'Player One', linkedAt: '2026-10-05T00:00:00.000Z', lastSyncedAt: null, linkExpiresAt: null },
      { library: 'playstation', account: null, linkedAt: '2026-10-05T00:00:00.000Z', lastSyncedAt: '2026-10-05T00:00:00.000Z', linkExpiresAt: '2026-12-04T00:00:00.000Z' },
      { library: 'exophase', account: '555', linkedAt: '2026-10-05T00:00:00.000Z', lastSyncedAt: null, linkExpiresAt: null },
    ]);
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('reports AI settings with only whether a key is saved, and never asks for the key itself', async () => {
    h.ai.mockResolvedValue({ provider: 'anthropic', model: 'claude-sonnet-5-5', baseUrl: null, apiKeyEncrypted: 'enc:v1:abc' });
    const out = await loadExportExtras('u1');
    expect(out.aiSettings).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5-5', baseUrl: null, hasApiKey: true });
    expect(JSON.stringify(out)).not.toContain('enc:v1');
    // The key column is read only to say whether one exists; the saved value is never returned.
    expect(h.ai.mock.calls[0][0].select.apiKeyEncrypted).toBe(true);
  });

  it('lists the rooms using the person\'s AI key and the games they merged', async () => {
    h.rooms.mockResolvedValue([{ name: 'Friday crew' }]);
    h.merged.mockResolvedValue([{ fromTitle: 'The Witcher 3', toTitle: 'The Witcher 3: Complete Edition', createdAt: at }]);
    const out = await loadExportExtras('u1');
    expect(out.roomsUsingYourAiKey).toEqual(['Friday crew']);
    expect(out.mergedGames).toEqual([{ fromTitle: 'The Witcher 3', toTitle: 'The Witcher 3: Complete Edition', mergedAt: '2026-10-05T00:00:00.000Z' }]);
  });
});
