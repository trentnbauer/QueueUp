import { describe, expect, it, vi } from 'vitest';
import { fetchItchLibrary, ItchError, ownedKeysToEntries } from './itchClient.js';

const asFetch = (fn: unknown) => fn as unknown as typeof fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const key = (title: string, classification = 'game', traits: string[] = []) => ({ game: { title, classification, traits } });

describe('ownedKeysToEntries', () => {
  it('keeps games only, reads platforms from traits and defaults to PC', () => {
    expect(
      ownedKeysToEntries([
        key('Celeste Classic', 'game', ['p_windows', 'p_osx', 'p_android']),
        key('Web Thing', 'game', []),
        key('Soundtrack Vol 1', 'soundtrack'),
        key('Asset Pack', 'assets'),
        { game: null },
      ]),
    ).toEqual([
      { title: 'Celeste Classic', platforms: ['pc', 'android'] },
      { title: 'Web Thing', platforms: ['pc'] },
    ]);
  });

  it('merges a title owned twice', () => {
    expect(ownedKeysToEntries([key('Dup', 'game', ['p_windows']), key('dup', 'game', ['p_android'])])).toEqual([{ title: 'Dup', platforms: ['pc', 'android'] }]);
  });
});

describe('fetchItchLibrary', () => {
  it('pages until an empty page and sends the key as a bearer header, not in the URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ owned_keys: [key('A')] }))
      .mockResolvedValueOnce(json({ owned_keys: [key('B')] }))
      .mockResolvedValueOnce(json({ owned_keys: [] }));
    const entries = await fetchItchLibrary('secret', asFetch(fetchMock));
    expect(entries.map((e) => e.title)).toEqual(['A', 'B']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).not.toContain('secret');
    expect(init.headers.Authorization).toBe('Bearer secret');
  });

  it('reports a refused key as fixable', async () => {
    const err = await fetchItchLibrary('bad', asFetch(vi.fn().mockResolvedValue(json({ errors: ['invalid key'] }, 401)))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ItchError);
    expect((err as ItchError).badKey).toBe(true);
  });

  it('reports an unreachable or failing site as not fixable', async () => {
    const down = await fetchItchLibrary('k', asFetch(vi.fn().mockRejectedValue(new Error('net')))).catch((e: unknown) => e);
    expect((down as ItchError).badKey).toBe(false);
    const broken = await fetchItchLibrary('k', asFetch(vi.fn().mockResolvedValue(json({}, 500)))).catch((e: unknown) => e);
    expect((broken as ItchError).badKey).toBe(false);
  });
});
