import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ steam: vi.fn(), igdb: vi.fn() }));
vi.mock('./steamContent.js', () => ({ getSteamAdultOnly: m.steam }));
vi.mock('./igdbClient.js', () => ({ getIgdbAdultsOnly: m.igdb }));

import { adultOnlyFromSources } from './adultSources.js';

beforeEach(() => vi.clearAllMocks());

describe('adultOnlyFromSources', () => {
  it('is true as soon as Steam says yes, without asking IGDB', async () => {
    m.steam.mockResolvedValue(true);
    expect(await adultOnlyFromSources({ steamAppid: 1, igdbId: 2 })).toBe(true);
    expect(m.igdb).not.toHaveBeenCalled();
  });

  it('is true when IGDB says Adults Only even though Steam says no, or the game has no Steam id (a console exclusive)', async () => {
    m.steam.mockResolvedValue(false);
    m.igdb.mockResolvedValue(true);
    expect(await adultOnlyFromSources({ steamAppid: 1, igdbId: 2 })).toBe(true);
    expect(await adultOnlyFromSources({ steamAppid: null, igdbId: 2 })).toBe(true);
  });

  it('only asks Steam for a game that has a Steam id', async () => {
    m.igdb.mockResolvedValue(false);
    await adultOnlyFromSources({ steamAppid: null, igdbId: 2 });
    expect(m.steam).not.toHaveBeenCalled();
  });

  it('is false only when every source asked said no', async () => {
    m.steam.mockResolvedValue(false);
    m.igdb.mockResolvedValue(false);
    expect(await adultOnlyFromSources({ steamAppid: 1, igdbId: 2 })).toBe(false);
    expect(await adultOnlyFromSources({ steamAppid: null, igdbId: 2 })).toBe(false);
  });

  it('is unknown (null) when a source could not be reached and nothing said yes', async () => {
    m.steam.mockResolvedValue(null);
    m.igdb.mockResolvedValue(false);
    expect(await adultOnlyFromSources({ steamAppid: 1, igdbId: 2 })).toBeNull();
    m.steam.mockResolvedValue(false);
    m.igdb.mockResolvedValue(null);
    expect(await adultOnlyFromSources({ steamAppid: 1, igdbId: 2 })).toBeNull();
  });
});
