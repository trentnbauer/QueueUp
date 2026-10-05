import { describe, expect, it, vi } from 'vitest';
import { cleanTitle, fetchLibrary, fetchProgressPage, gamesToEntries, platformFromConsole, RetroAchievementsError, verifyAccount } from './raClient.js';

const asFetch = (fn: unknown) => fn as unknown as typeof fetch;
const reply = (Results: unknown[], Total = Results.length, status = 200) => new Response(JSON.stringify({ Count: Results.length, Total, Results }), { status });
const game = (Title: string, ConsoleName: string, HighestAwardKind: string | null = null) => ({ Title, ConsoleName, HighestAwardKind });
const auth = { username: 'Player', apiKey: 'k'.repeat(32) };
const noSleep = async () => undefined;

describe('platformFromConsole', () => {
  it.each([
    ['NES/Famicom', 'nes'],
    ['SNES/Super Famicom', 'snes'],
    ['Nintendo 64', 'n64'],
    ['Game Boy', 'gb'],
    ['Game Boy Color', 'gbc'],
    ['Game Boy Advance', 'gba'],
    ['Nintendo DS', 'ds'],
    ['Nintendo DSi', 'ds'],
    ['Nintendo 3DS', 'n3ds'],
    ['GameCube', 'gamecube'],
    ['Wii', 'wii'],
    ['Wii U', 'wii_u'],
    ['PlayStation', 'ps1'],
    ['PlayStation 2', 'ps2'],
    ['PlayStation Portable', 'psp'],
    ['Mega Drive', 'genesis'],
    ['Genesis', 'genesis'],
    ['Master System', 'master_system'],
    ['Saturn', 'saturn'],
    ['Dreamcast', 'dreamcast'],
  ])('maps %s to %s', (name, platform) => expect(platformFromConsole(name)).toBe(platform));

  it('leaves out consoles QueueUp does not track', () => {
    for (const name of ['Arcade', 'DOS', 'Atari 2600', 'Neo Geo Pocket', 'Xbox', 'PC Engine/TurboGrafx-16']) expect(platformFromConsole(name)).toBeNull();
  });
});

describe('cleanTitle', () => {
  it('keeps a normal title and drops the tags that do not change the game', () => {
    expect(cleanTitle('Super Mario Bros.')).toBe('Super Mario Bros.');
    expect(cleanTitle('~Unlicensed~ Tengen Tetris')).toBe('Tengen Tetris');
  });

  it('skips hacks, homebrew, demos, prototypes and subsets', () => {
    expect(cleanTitle('~Hack~ Super Mario Bros. Plus')).toBeNull();
    expect(cleanTitle('~Homebrew~ Some Game')).toBeNull();
    expect(cleanTitle('~Demo~ ~Hack~ Stuff')).toBeNull();
    expect(cleanTitle('~Prototype~ Early Build')).toBeNull();
    expect(cleanTitle('Sonic the Hedgehog [Subset - Bonus]')).toBeNull();
    expect(cleanTitle('   ')).toBeNull();
  });
});

describe('gamesToEntries', () => {
  it('joins one title across consoles and flags a finished one', () => {
    expect(
      gamesToEntries([
        game('Tetris', 'Game Boy', 'beaten-softcore'),
        game('Tetris', 'NES/Famicom'),
        game('Pokemon Red', 'Game Boy', 'mastered'),
        game('Chrono Trigger', 'SNES/Super Famicom', 'completed'),
        game('Zelda', 'Nintendo 64', 'beaten-hardcore'),
        game('Metroid', 'NES/Famicom', null),
      ]),
    ).toEqual([
      { title: 'Tetris', platforms: ['gb', 'nes'], isCompleted: true },
      { title: 'Pokemon Red', platforms: ['gb'], isCompleted: true },
      { title: 'Chrono Trigger', platforms: ['snes'], isCompleted: true },
      { title: 'Zelda', platforms: ['n64'], isCompleted: true },
      { title: 'Metroid', platforms: ['nes'] },
    ]);
  });

  it('skips hacks, untracked consoles and junk rows', () => {
    expect(gamesToEntries([game('~Hack~ X', 'NES/Famicom'), game('Pac-Man', 'Arcade'), {} as never, null as never])).toEqual([]);
  });
});

describe('fetchProgressPage', () => {
  it('authenticates with the username and key in the query and asks for the page', async () => {
    const impl = vi.fn(async () => reply([game('A', 'Game Boy')], 7));
    const page = await fetchProgressPage(auth, 500, 500, asFetch(impl));
    expect(page.total).toBe(7);
    const [url, init] = impl.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://retroachievements.org/API/API_GetUserCompletionProgress.php');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ z: 'Player', y: auth.apiKey, u: 'Player', c: '500', o: '500' });
    expect((init.headers as Record<string, string>)['user-agent']).toMatch(/^QueueUp/);
  });

  it('asks for the key again when RetroAchievements rejects it', async () => {
    for (const impl of [vi.fn(async () => new Response('', { status: 401 })), vi.fn(async () => new Response(JSON.stringify({ message: 'Invalid API Key' }), { status: 200 }))]) {
      const err = await fetchProgressPage(auth, 0, 1, asFetch(impl)).catch((e) => e);
      expect(err).toBeInstanceOf(RetroAchievementsError);
      expect(err.needsRelink).toBe(true);
      expect(err.message).toMatch(/username and key/);
    }
  });

  it('reports an unknown profile, a rate limit, an outage and a network failure', async () => {
    expect((await fetchProgressPage(auth, 0, 1, asFetch(vi.fn(async () => new Response('{}', { status: 404 })))).catch((e) => e)).message).toMatch(/no profile/);
    expect((await fetchProgressPage(auth, 0, 1, asFetch(vi.fn(async () => new Response('', { status: 429 })))).catch((e) => e)).message).toMatch(/limiting/);
    expect((await fetchProgressPage(auth, 0, 1, asFetch(vi.fn(async () => new Response('', { status: 503 })))).catch((e) => e)).message).toMatch(/problems/);
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await fetchProgressPage(auth, 0, 1, asFetch(down)).catch((e) => e);
    expect(err.message).toMatch(/Could not reach/);
    expect(err.needsRelink).toBe(false);
  });
});

describe('verifyAccount', () => {
  it('returns how many games the profile lists', async () => {
    expect(await verifyAccount(auth, asFetch(vi.fn(async () => reply([game('A', 'Game Boy')], 42))))).toBe(42);
  });

  it('says so when the profile has no games yet', async () => {
    await expect(verifyAccount(auth, asFetch(vi.fn(async () => reply([], 0))))).rejects.toThrow(/no games yet/);
  });
});

describe('fetchLibrary', () => {
  it('reads every page until it has them all and pauses between pages', async () => {
    const pages = [reply([game('A', 'Game Boy')], 3), reply([game('B', 'NES/Famicom'), game('C', 'Nintendo 64')], 3)];
    const impl = vi.fn(async () => pages.shift()!);
    const sleep = vi.fn(noSleep);
    const entries = await fetchLibrary(auth, asFetch(impl), sleep);
    expect(entries.map((e) => e.title)).toEqual(['A', 'B', 'C']);
    expect(impl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('stops on an empty page rather than looping', async () => {
    const impl = vi.fn(async () => reply([], 99));
    expect(await fetchLibrary(auth, asFetch(impl), noSleep)).toEqual([]);
    expect(impl).toHaveBeenCalledTimes(1);
  });
});
