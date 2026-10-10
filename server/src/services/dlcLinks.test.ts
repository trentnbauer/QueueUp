import { beforeEach, describe, expect, it, vi } from 'vitest';

const { gameFindFirst, gameUpdate, gameUpdateMany, getGameAddonIgdbIds } = vi.hoisted(() => ({ gameFindFirst: vi.fn(), gameUpdate: vi.fn(), gameUpdateMany: vi.fn(), getGameAddonIgdbIds: vi.fn() }));
vi.mock('../db/client.js', () => ({ prisma: { game: { findFirst: gameFindFirst, update: gameUpdate, updateMany: gameUpdateMany } } }));
vi.mock('./igdbClient.js', () => ({ getGameAddonIgdbIds }));

import { dropDlcPairs, linkDlcToBaseCard, type DlcCheckCard } from './dlcLinks.js';

const card = (id: string, igdbId: number, title: string): DlcCheckCard => ({ id, igdbId, title });
/** IGDB's DLC lists: base igdbId -> the igdbIds listed under it. */
const dlcLists = (lists: Record<number, number[]>) => getGameAddonIgdbIds.mockImplementation(async (igdbId: number) => new Set(lists[igdbId] ?? []));
const self = (pair: [DlcCheckCard, DlcCheckCard]) => pair;

beforeEach(() => {
  vi.clearAllMocks();
  gameUpdate.mockResolvedValue({});
  gameUpdateMany.mockResolvedValue({ count: 1 });
  dlcLists({});
});

describe('dropDlcPairs', () => {
  const base = card('base', 1, 'Cyberpunk 2077');
  const dlc = card('dlc', 2, 'Cyberpunk 2077: Phantom Liberty');
  const edition = card('ed', 3, 'Cyberpunk 2077: Ultimate Edition');

  it('drops a game and its DLC whichever card comes first, and links the DLC card to the base card', async () => {
    dlcLists({ 1: [2] });
    for (const pair of [[base, dlc], [dlc, base]] as [DlcCheckCard, DlcCheckCard][]) {
      gameUpdateMany.mockClear();
      const res = await dropDlcPairs('u1', [pair], self);
      expect(res.pairs).toEqual([]);
      expect([...res.dlcCardIds]).toEqual(['dlc']);
      expect(gameUpdateMany).toHaveBeenCalledTimes(1);
      expect(gameUpdateMany).toHaveBeenCalledWith({ where: { id: 'dlc', roomId: null, addedBy: 'u1', baseGameId: null }, data: { baseGameId: 'base' } });
    }
  });

  it('finds the base game even when it has the longer title', async () => {
    const longBase = card('lb', 10, 'The Elder Scrolls V: Skyrim');
    const shortDlc = card('sd', 11, 'Skyrim: Dawnguard');
    dlcLists({ 10: [11] });
    const res = await dropDlcPairs('u1', [[longBase, shortDlc] as [DlcCheckCard, DlcCheckCard]], self);
    expect(res.pairs).toEqual([]);
    expect(gameUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { baseGameId: 'lb' } }));
  });

  it('keeps real duplicates, and asks IGDB about each card only once', async () => {
    dlcLists({ 1: [2] });
    const pairs: [DlcCheckCard, DlcCheckCard][] = [[base, dlc], [base, edition], [dlc, edition]];
    const res = await dropDlcPairs('u1', pairs, self);
    expect(res.pairs).toEqual([[base, edition], [dlc, edition]]);
    const asked = getGameAddonIgdbIds.mock.calls.map(([igdbId]) => igdbId as number).sort();
    expect(asked).toEqual([...new Set(asked)]);
  });

  it('leaves two cards of the same IGDB game alone without asking IGDB', async () => {
    const twin = card('twin', 1, 'Cyberpunk 2077 (GOG)');
    const pairs: [DlcCheckCard, DlcCheckCard][] = [[base, twin]];
    expect((await dropDlcPairs('u1', pairs, self)).pairs).toEqual(pairs);
    expect(getGameAddonIgdbIds).not.toHaveBeenCalled();
  });

  it('keeps the pair when IGDB fails, and still drops it when only saving the link fails', async () => {
    const pairs: [DlcCheckCard, DlcCheckCard][] = [[base, dlc]];
    getGameAddonIgdbIds.mockRejectedValue(new Error('IGDB request failed (503)'));
    expect((await dropDlcPairs('u1', pairs, self)).pairs).toEqual(pairs);
    expect(gameUpdateMany).not.toHaveBeenCalled();

    dlcLists({ 1: [2] });
    gameUpdateMany.mockRejectedValue(new Error('db down'));
    expect((await dropDlcPairs('u1', pairs, self)).pairs).toEqual([]);
  });

  it('does nothing for an empty list', async () => {
    expect(await dropDlcPairs('u1', [], self)).toEqual({ pairs: [], dlcCardIds: new Set() });
    expect(getGameAddonIgdbIds).not.toHaveBeenCalled();
  });
});

describe('linkDlcToBaseCard', () => {
  it('links the new card to the card whose DLC menu it was added from', async () => {
    gameFindFirst.mockResolvedValue({ id: 'base', igdbId: 1, baseGameId: null });
    dlcLists({ 1: [2] });
    expect(await linkDlcToBaseCard('dlc', 2, 'base', null, 'u1')).toBe(true);
    expect(gameFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: null, addedBy: 'u1', id: 'base' } }));
    expect(gameUpdate).toHaveBeenCalledWith({ where: { id: 'dlc' }, data: { baseGameId: 'base' } });
  });

  it('looks for the base card in the room when the add is to a room', async () => {
    gameFindFirst.mockResolvedValue({ id: 'base', igdbId: 1, baseGameId: null });
    dlcLists({ 1: [2] });
    expect(await linkDlcToBaseCard('dlc', 2, 'base', 'room-1', 'u1')).toBe(true);
    expect(gameFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: 'room-1', id: 'base' } }));
  });

  it('does not link a card IGDB does not list as that game\'s DLC', async () => {
    gameFindFirst.mockResolvedValue({ id: 'base', igdbId: 1, baseGameId: null });
    dlcLists({ 1: [5] });
    expect(await linkDlcToBaseCard('other', 2, 'base', null, 'u1')).toBe(false);
    expect(gameUpdate).not.toHaveBeenCalled();
  });

  it('does not link to a card outside the room or shelf, or to itself', async () => {
    gameFindFirst.mockResolvedValue(null);
    expect(await linkDlcToBaseCard('dlc', 2, 'someone-elses-card', null, 'u1')).toBe(false);
    gameFindFirst.mockResolvedValue({ id: 'dlc', igdbId: 2, baseGameId: null });
    expect(await linkDlcToBaseCard('dlc', 2, 'dlc', null, 'u1')).toBe(false);
    expect(getGameAddonIgdbIds).not.toHaveBeenCalled();
    expect(gameUpdate).not.toHaveBeenCalled();
  });

  it('returns false instead of failing the add when IGDB or the database fails', async () => {
    gameFindFirst.mockResolvedValue({ id: 'base', igdbId: 1, baseGameId: null });
    getGameAddonIgdbIds.mockRejectedValue(new Error('IGDB request failed (503)'));
    expect(await linkDlcToBaseCard('dlc', 2, 'base', null, 'u1')).toBe(false);
    dlcLists({ 1: [2] });
    gameUpdate.mockRejectedValue(new Error('db down'));
    expect(await linkDlcToBaseCard('dlc', 2, 'base', null, 'u1')).toBe(false);
  });
});
