import { describe, expect, it, vi } from 'vitest';
import { fetchXboxLibrary, titlesToEntries } from './xboxLibrary.js';
import { XboxAuthError } from './xboxAuth.js';

describe('titlesToEntries', () => {
  it('keeps games on Xbox consoles and maps their devices', () => {
    const entries = titlesToEntries([
      { name: 'Halo Infinite', type: 'Game', devices: ['XboxOne', 'XboxSeries', 'PC'] },
      { name: 'Fable', type: 'Game', devices: ['Xbox360'] },
    ]);
    expect(entries).toEqual([
      { title: 'Halo Infinite', platforms: ['xbox_one', 'xbox_series'] },
      { title: 'Fable', platforms: ['xbox_360'] },
    ]);
  });

  it('leaves out apps, PC-only and mobile titles, and nameless rows', () => {
    expect(
      titlesToEntries([
        { name: 'Netflix', type: 'App', devices: ['XboxOne'] },
        { name: 'PC Only', type: 'Game', devices: ['PC'] },
        { name: 'Phone Game', type: 'Game', devices: ['Mobile'] },
        { type: 'Game', devices: ['XboxOne'] },
        { name: '   ', type: 'Game', devices: ['XboxOne'] },
      ]),
    ).toEqual([]);
  });

  it('joins repeated titles into one entry with every console', () => {
    expect(
      titlesToEntries([
        { name: 'Forza', type: 'Game', devices: ['XboxOne'] },
        { name: 'Forza', type: 'Game', devices: ['XboxSeries'] },
      ]),
    ).toEqual([{ title: 'Forza', platforms: ['xbox_one', 'xbox_series'] }]);
  });

  it('accepts a title with no type and tolerates junk', () => {
    expect(titlesToEntries([{ name: 'Untyped', devices: ['XboxSeries'] }, { name: 'No devices' }, null as never])).toEqual([
      { title: 'Untyped', platforms: ['xbox_series'] },
    ]);
  });
});

describe('fetchXboxLibrary', () => {
  const session = { authorization: 'XBL3.0 x=u;t', xuid: '2533274' };
  const asFetch = (fn: unknown) => fn as unknown as typeof fetch;

  it('reads the title history for the account with the right headers', async () => {
    const impl = vi.fn(async () => new Response(JSON.stringify({ titles: [{ name: 'Halo', type: 'Game', devices: ['XboxOne'] }] }), { status: 200 }));
    const entries = await fetchXboxLibrary(session, asFetch(impl));
    expect(entries).toEqual([{ title: 'Halo', platforms: ['xbox_one'] }]);
    const [url, init] = impl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://titlehub.xboxlive.com/users/xuid(2533274)/titles/titlehistory/decoration/detail');
    expect((init.headers as Record<string, string>).authorization).toBe('XBL3.0 x=u;t');
    expect((init.headers as Record<string, string>)['x-xbl-contract-version']).toBe('2');
  });

  it('asks the person to link again when Xbox Live refuses the login', async () => {
    const impl = vi.fn(async () => new Response('', { status: 401 }));
    const err = await fetchXboxLibrary(session, asFetch(impl)).catch((e) => e);
    expect(err).toBeInstanceOf(XboxAuthError);
    expect(err.needsRelink).toBe(true);
  });

  it('reports other failures without asking to link again', async () => {
    const impl = vi.fn(async () => new Response('', { status: 500 }));
    const err = await fetchXboxLibrary(session, asFetch(impl)).catch((e) => e);
    expect(err.needsRelink).toBe(false);
    expect(err.message).toContain('500');
  });

  it('treats an empty or odd body as an empty library', async () => {
    const impl = vi.fn(async () => new Response('not json', { status: 200 }));
    expect(await fetchXboxLibrary(session, asFetch(impl))).toEqual([]);
  });
});
