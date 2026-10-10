import { prisma } from '../db/client.js';
import { runWithConcurrency } from '../util/concurrency.js';
import { getGameAddonIgdbIds } from './igdbClient.js';

export interface DlcCheckCard {
  id: string;
  igdbId: number;
  title: string;
}

/** IGDB allows about 4 requests a second; a lookup that is not cached is one request. */
const DLC_CHECK_PARALLEL = 3;

/** Takes out the pairs where IGDB lists one card as the other's DLC or expansion: a base game and
 * its DLC are two things to track, never a duplicate ("Cyberpunk 2077" and "Cyberpunk 2077:
 * Phantom Liberty").
 *
 * The shelf queries already leave out cards that have a base game (baseGameId), but that link is
 * only made when the card is added, and only if IGDB's entry for the DLC itself names its parent.
 * A DLC card that missed it looks like any other game whose title starts with the base game's. So
 * this asks from the other side - is this card in the other one's DLC list, the list the "View
 * DLC" menu shows - and, when it is, also sets the missing link, so the card is left out by the
 * query from then on and is not looked up again.
 *
 * Only the cards in `pairs` are looked up, once each, from a 24h cache. A pair stays if IGDB can't
 * be reached: showing a doubtful pair is better than failing the list. Personal Shelf only.
 *
 * Returns the pairs that are left, and the ids of the cards found to be DLC. */
export async function dropDlcPairs<P>(
  userId: string,
  pairs: P[],
  cardsOf: (pair: P) => [DlcCheckCard, DlcCheckCard],
): Promise<{ pairs: P[]; dlcCardIds: Set<string> }> {
  if (pairs.length === 0) return { pairs, dlcCardIds: new Set() };
  const lookups = new Map<number, Promise<Set<number> | null>>();
  const addonsOf = (igdbId: number) => {
    let lookup = lookups.get(igdbId);
    if (!lookup) {
      lookup = getGameAddonIgdbIds(igdbId).catch(() => null);
      lookups.set(igdbId, lookup);
    }
    return lookup;
  };

  const dlcPairs = new Set<P>();
  /** DLC card id -> its base game's card id. */
  const links = new Map<string, string>();
  await runWithConcurrency(pairs, DLC_CHECK_PARALLEL, async (pair) => {
    const [x, y] = cardsOf(pair);
    // Two cards of one IGDB game are an exact duplicate, not a game and its DLC.
    if (x.igdbId === y.igdbId) return;
    // The base game nearly always has the shorter title, so it is asked about first.
    const [first, second] = x.title.length <= y.title.length ? [x, y] : [y, x];
    const [base, dlc] = (await addonsOf(first.igdbId))?.has(second.igdbId)
      ? [first, second]
      : (await addonsOf(second.igdbId))?.has(first.igdbId)
        ? [second, first]
        : [null, null];
    if (!base || !dlc) return;
    dlcPairs.add(pair);
    links.set(dlc.id, base.id);
  });
  if (dlcPairs.size === 0) return { pairs, dlcCardIds: new Set() };

  // Best effort: the pair is left out of this answer whether or not the link could be saved.
  await Promise.all(
    [...links].map(([dlcId, baseId]) =>
      prisma.game.updateMany({ where: { id: dlcId, roomId: null, addedBy: userId, baseGameId: null }, data: { baseGameId: baseId } }).catch(() => undefined),
    ),
  );
  return { pairs: pairs.filter((pair) => !dlcPairs.has(pair)), dlcCardIds: new Set(links.keys()) };
}

/** Links a card that was just added from another card's DLC menu to that card. linkDlcToBaseGame
 * (gameIntake.ts) works from the DLC's own IGDB entry (its category and parent), which IGDB does
 * not always fill in, and a card that misses the link is treated as a separate game everywhere -
 * the duplicate finder offers to merge it into its base game. Here the base card is already
 * known; it only has to be in the same room or on the same person's shelf, and IGDB has to list
 * this game among its DLC and expansions (the list the menu showed), so a made-up baseGameId
 * cannot link two unrelated cards. Best effort like linkDlcToBaseGame: false when the link was
 * not made, never an error. */
export async function linkDlcToBaseCard(dlcGameId: string, dlcIgdbId: number, baseGameId: string, roomId: string | null, userId: string): Promise<boolean> {
  try {
    // The same scope as duplicateScopeWhere (gameAccess.ts): the room, or this person's own shelf.
    const scope = roomId ? { roomId } : { roomId: null, addedBy: userId };
    const base = await prisma.game.findFirst({ where: { ...scope, id: baseGameId }, select: { id: true, igdbId: true, baseGameId: true } });
    if (!base || base.id === dlcGameId) return false;
    if (!(await getGameAddonIgdbIds(base.igdbId)).has(dlcIgdbId)) return false;
    // A DLC card's own menu lists nothing, but never chain: the link always points at a base game.
    await prisma.game.update({ where: { id: dlcGameId }, data: { baseGameId: base.baseGameId ?? base.id } });
    return true;
  } catch {
    return false;
  }
}
