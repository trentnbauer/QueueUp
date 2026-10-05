import { describe, expect, it, vi } from 'vitest';
import { fetchPurchasedLibrary, gamesToEntries } from './psnLibrary.js';

const asFetch = (fn: unknown) => fn as unknown as typeof fetch;
const page = (games: unknown[]) => new Response(JSON.stringify({ data: { purchasedTitlesRetrieve: { games } } }), { status: 200 });
const game = (name: string, platform: string) => ({ name, platform, isActive: true });

describe('gamesToEntries', () => {
  it('maps PS4 and PS5 and joins one title bought for both', () => {
    expect(gamesToEntries([game('Returnal', 'PS5'), game('Bloodborne', 'PS4'), game('Hades', 'PS4'), game('Hades', 'PS5')])).toEqual([
      { title: 'Returnal', platforms: ['ps5'] },
      { title: 'Bloodborne', platforms: ['ps4'] },
      { title: 'Hades', platforms: ['ps4', 'ps5'] },
    ]);
  });

  it('skips nameless rows and platforms it does not map', () => {
    expect(gamesToEntries([game('  ', 'PS5'), game('Old', 'PS3'), game('Handheld', 'Vita'), {} as never, null as never])).toEqual([]);
  });
});

describe('fetchPurchasedLibrary', () => {
  it('pages through the library until a short page and sends the persisted query', async () => {
    const full = Array.from({ length: 24 }, (_, i) => game(`Game ${i}`, 'PS5'));
    const pages = [page(full), page([game('Last', 'PS4')])];
    const impl = vi.fn(async () => pages.shift()!);
    const entries = await fetchPurchasedLibrary('access-token', asFetch(impl));

    expect(entries).toHaveLength(25);
    expect(impl).toHaveBeenCalledTimes(2);
    const [url, init] = impl.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://web.np.playstation.com/api/graphql/v1/op');
    expect(parsed.searchParams.get('operationName')).toBe('getPurchasedGameList');
    expect(JSON.parse(parsed.searchParams.get('variables')!)).toMatchObject({ isActive: true, platform: ['ps4', 'ps5'], size: 24, start: 0 });
    expect(JSON.parse(parsed.searchParams.get('extensions')!).persistedQuery.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer access-token');
    // The second page starts where the first ended.
    expect(JSON.parse(new URL((impl.mock.calls[1] as unknown as [string])[0]).searchParams.get('variables')!).start).toBe(24);
  });

  it('returns an empty library for an account with no purchases', async () => {
    expect(await fetchPurchasedLibrary('t', asFetch(vi.fn(async () => page([]))))).toEqual([]);
  });

  it('asks the person to link again when Sony refuses the login', async () => {
    const err = await fetchPurchasedLibrary('t', asFetch(vi.fn(async () => new Response('', { status: 401 })))).catch((e) => e);
    expect(err.needsRelink).toBe(true);
  });

  it('says so when Sony changed the query rather than reporting an empty library', async () => {
    const changed = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'PersistedQueryNotFound' }] }), { status: 200 }));
    const err = await fetchPurchasedLibrary('t', asFetch(changed)).catch((e) => e);
    expect(err.message).toMatch(/changed how its library is read/);
    expect(err.needsRelink).toBe(false);
  });

  it('reports a Sony outage and a network failure without asking to link again', async () => {
    expect((await fetchPurchasedLibrary('t', asFetch(vi.fn(async () => new Response('', { status: 503 })))).catch((e) => e)).message).toMatch(/problems/);
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect((await fetchPurchasedLibrary('t', asFetch(down)).catch((e) => e)).message).toMatch(/Could not reach/);
  });
});
