import { getIgdbAdultsOnly } from './igdbClient.js';
import { getSteamAdultOnly } from './steamContent.js';

/** Asks every source that can say a game is adult-only, without an AI: Steam's "Adult Only Sexual Content" store
 * descriptor (for a game with a Steam id - a console game is matched to its Steam page through IGDB, which
 * links the platforms of one game together) and IGDB's ESRB "Adults Only" rating (which also covers console
 * exclusives with no Steam page). True as soon as one says yes; false only when every source asked said no; null
 * when none said yes and one could not be reached, so the caller tries again later. */
export async function adultOnlyFromSources(game: { steamAppid: number | null; igdbId: number }): Promise<boolean | null> {
  let unsure = false;
  if (game.steamAppid !== null) {
    const steam = await getSteamAdultOnly(game.steamAppid);
    if (steam === true) return true;
    if (steam === null) unsure = true;
  }
  const igdb = await getIgdbAdultsOnly(game.igdbId);
  if (igdb === true) return true;
  if (igdb === null) unsure = true;
  return unsure ? null : false;
}
