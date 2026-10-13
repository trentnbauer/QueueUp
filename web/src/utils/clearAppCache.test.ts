import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAppCache } from './clearAppCache';

afterEach(() => vi.unstubAllGlobals());

describe('clearAppCache', () => {
  it('deletes every cache, unregisters service workers and clears session storage', async () => {
    const deleted: string[] = [];
    const unregister = vi.fn(async () => true);
    const clear = vi.fn();
    vi.stubGlobal('caches', { keys: async () => ['a', 'b'], delete: async (k: string) => (deleted.push(k), true) });
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister }, { unregister }] } });
    vi.stubGlobal('sessionStorage', { clear });
    expect(await clearAppCache()).toBe(2);
    expect(deleted).toEqual(['a', 'b']);
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalled();
  });

  it('copes with a browser that has none of it', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('sessionStorage', {
      clear: () => {
        throw new Error('blocked');
      },
    });
    expect(await clearAppCache()).toBe(0);
  });
});
