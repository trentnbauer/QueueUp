import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSteamStorageMb, parseStorageMb } from './steamStorage.js';

describe('parseStorageMb', () => {
  it('reads the storage line from Steam requirements HTML', () => {
    expect(parseStorageMb('<ul><li><strong>Storage:</strong> 60 GB available space</li></ul>')).toBe(61440);
    expect(parseStorageMb('<li><strong>Hard Drive:</strong> 512 MB available space</li>')).toBe(512);
    expect(parseStorageMb('<strong>Hard Disk Space:</strong> 1.5 GB')).toBe(1536);
    expect(parseStorageMb('Storage: 1 TB available space')).toBe(1048576);
    expect(parseStorageMb('<strong>Storage:</strong>&nbsp;8,5 GB available space')).toBe(8704);
    expect(parseStorageMb('Hard Drive: 1,500 MB available space')).toBe(1500);
  });

  it('is null when there is no size or it makes no sense', () => {
    expect(parseStorageMb('<li><strong>Memory:</strong> 8 GB RAM</li>')).toBeNull();
    expect(parseStorageMb('')).toBeNull();
    expect(parseStorageMb(null)).toBeNull();
    expect(parseStorageMb('Storage: 9000 TB')).toBeNull();
  });
});

describe('parseStorageMb on hostile input', () => {
  it('stays fast on a long run of spaces with no size (no catastrophic backtracking)', () => {
    const t = Date.now();
    expect(parseStorageMb(`Storage:${'&nbsp;'.repeat(5000)}x`)).toBeNull();
    expect(parseStorageMb(`storage${' :'.repeat(20000)}x`)).toBeNull();
    expect(Date.now() - t).toBeLessThan(200);
  });
});

describe('fetchSteamStorageMb', () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }) as unknown as Response);

  it('asks for "basic" with the requirements (the requirements alone now come back empty) and reads the size', async () => {
    const fetchMock = reply({ '10': { success: true, data: { pc_requirements: { minimum: '<ul><li><strong>Storage:</strong> 60 GB available space</li></ul>' } } } });
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchSteamStorageMb(10)).toBe(60 * 1024);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('appids')).toBe('10');
    expect(url.searchParams.get('filters')).toBe('basic,pc_requirements');
  });

  it('is null for a game with no PC requirements (an empty list), and throws when Steam cannot be reached', async () => {
    vi.stubGlobal('fetch', reply({ '10': { success: true, data: { pc_requirements: [] } } }));
    expect(await fetchSteamStorageMb(10)).toBeNull();
    vi.stubGlobal('fetch', reply({ '10': { success: true, data: [] } }));
    expect(await fetchSteamStorageMb(10)).toBeNull();
    vi.stubGlobal('fetch', reply({}, false));
    await expect(fetchSteamStorageMb(10)).rejects.toThrow('503');
  });
});
