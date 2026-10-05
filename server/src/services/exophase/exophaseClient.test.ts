import { describe, expect, it, vi } from 'vitest';
import { ExophaseError, fetchGamesPage, fetchLibrary, gamesToEntries, platformsFromNames, resolvePlayerId } from './exophaseClient.js';

const asFetch = (fn: unknown) => fn as unknown as typeof fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const game = (title: string, ...platforms: string[]) => ({ meta: { title, platforms: platforms.map((name) => ({ name })) } });
const noSleep = async () => undefined;

describe('platformsFromNames', () => {
  it('maps console generations by name', () => {
    expect(platformsFromNames(['PS5', 'PS4'])).toEqual(['ps5', 'ps4']);
    expect(platformsFromNames(['PlayStation 3', 'PS Vita'])).toEqual(['ps3', 'vita']);
    expect(platformsFromNames(['Xbox Series X|S', 'Xbox One', 'Xbox 360'])).toEqual(['xbox_series', 'xbox_one', 'xbox_360']);
    expect(platformsFromNames(['Nintendo Switch', 'Switch 2'])).toEqual(['switch', 'switch2']);
  });

  it('counts every PC store as PC, once', () => {
    expect(platformsFromNames(['Steam', 'Epic Games', 'GOG', 'Ubisoft', 'EA', 'Battle.net'])).toEqual(['pc']);
  });

  it('leaves out a bare Xbox, mobile and retro', () => {
    expect(platformsFromNames(['Xbox', 'Google Play', 'Apple Game Center', 'RetroAchievements'])).toEqual([]);
  });
});

describe('gamesToEntries', () => {
  it('joins one title across platforms and skips what it cannot place', () => {
    expect(
      gamesToEntries([
        game('Hades', 'Steam', 'PS5'),
        game('Hades', 'Nintendo Switch'),
        game('Mobile Only', 'Google Play'),
        game('  ', 'Steam'),
        {} as never,
      ]),
    ).toEqual([{ title: 'Hades', platforms: ['pc', 'ps5', 'switch'] }]);
  });
});

describe('fetchGamesPage', () => {
  it('asks for the page of the player\'s games and returns them', async () => {
    const impl = vi.fn(async () => json({ success: true, games: [game('A', 'PS5')] }));
    expect(await fetchGamesPage('1234', 2, asFetch(impl))).toHaveLength(1);
    const [url, init] = impl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.exophase.com/public/player/1234/games?page=2&environment=&sort=1&showHidden=0');
    expect((init.headers as Record<string, string>)['user-agent']).toMatch(/^QueueUp/);
  });

  it('returns null for an empty page, a failure body or an unknown profile', async () => {
    expect(await fetchGamesPage('1', 1, asFetch(vi.fn(async () => json({ success: true, games: [] }))))).toBeNull();
    expect(await fetchGamesPage('1', 1, asFetch(vi.fn(async () => json({ success: false }))))).toBeNull();
    expect(await fetchGamesPage('1', 1, asFetch(vi.fn(async () => json({}, 404))))).toBeNull();
  });

  it('says so when Exophase blocks or breaks', async () => {
    await expect(fetchGamesPage('1', 1, asFetch(vi.fn(async () => json({}, 403))))).rejects.toThrow(/blocking/);
    await expect(fetchGamesPage('1', 1, asFetch(vi.fn(async () => json({}, 503))))).rejects.toThrow(/problems/);
    await expect(fetchGamesPage('1', 1, asFetch(vi.fn(async () => { throw new TypeError('fetch failed'); })))).rejects.toThrow(/Could not reach/);
  });
});

describe('resolvePlayerId', () => {
  it('accepts a numeric id without a request', async () => {
    const impl = vi.fn();
    expect(await resolvePlayerId(' 987654 ', asFetch(impl))).toBe('987654');
    expect(impl).not.toHaveBeenCalled();
  });

  it('reads the id from a profile page for a link or a name', async () => {
    const html = '<script>window.playerProfileId = 555123;</script>';
    const impl = vi.fn(async () => new Response(html, { status: 200 }));
    expect(await resolvePlayerId('https://www.exophase.com/user/Some.Player/', asFetch(impl))).toBe('555123');
    expect((impl.mock.calls[0] as unknown as [string])[0]).toBe('https://www.exophase.com/user/Some.Player/');
    expect(await resolvePlayerId('Some.Player', asFetch(impl))).toBe('555123');
  });

  it('explains how to find the number when the page cannot be read', async () => {
    const impl = vi.fn(async () => new Response('nope', { status: 403 }));
    await expect(resolvePlayerId('SomePlayer', asFetch(impl))).rejects.toThrow(/playerProfileId/);
  });

  it('rejects input that is not a profile', async () => {
    await expect(resolvePlayerId('not a profile!!', asFetch(vi.fn()))).rejects.toThrow(ExophaseError);
  });
});

describe('fetchLibrary', () => {
  it('reads every page until one is empty and pauses between pages', async () => {
    const pages = [json({ success: true, games: [game('A', 'PS5')] }), json({ success: true, games: [game('B', 'Steam')] }), json({ success: true, games: [] })];
    const impl = vi.fn(async () => pages.shift()!);
    const sleep = vi.fn(noSleep);
    expect(await fetchLibrary('1', asFetch(impl), sleep)).toEqual([
      { title: 'A', platforms: ['ps5'] },
      { title: 'B', platforms: ['pc'] },
    ]);
    expect(impl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('fails when the profile has nothing to read', async () => {
    const impl = vi.fn(async () => json({ success: true, games: [] }));
    await expect(fetchLibrary('1', asFetch(impl), noSleep)).rejects.toThrow(/No games found/);
  });
});
