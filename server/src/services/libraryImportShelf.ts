import { Prisma } from '@prisma/client';
import type { GameStatus, LibraryImportEntry } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { resolveGameForCreation, defaultStatusForRelease, linkDlcToBaseGame } from './gameIntake.js';
import { isAddonCategory } from './igdbClient.js';
import { promoteOwnedWishlistGames, setOwnershipPlatforms, unionOwnershipPlatforms } from './gameOwnership.js';

/** Shared by every library import that lands titles on the Personal Shelf (the Playnite push, and
 * the native Xbox/PlayStation syncs): once a title has an igdbId, this puts it on the shelf. */

export interface ResolvedShelfGame {
  id: string;
  status: GameStatus;
}

/** Applies one already-resolved igdbId to the shelf: unions ownership platforms onto an existing
 * game, or creates a new one - the same create-vs-union logic runPlayniteImportLoop always had,
 * pulled out so it can be pool-processed. `existingByIgdbId` is mutated in place, same as before.
 * Returns the resolved shelf game's id/status either way - issue #577's playtime/completion feeds
 * need the actual row to attach a PlaynitePlaytimeSnapshot/PlayniteCompletionSuggestion to, which
 * this function already looks up or creates regardless.
 *
 * Bounded concurrency (issue #465) means two entries in the same batch can now resolve to the same
 * igdbId at once (e.g. two differently-titled Playnite entries turning out to be the same IGDB
 * game) and both reach the create call before either lands - the `games_shelf_igdb_unique` partial
 * index (issue #326) is what actually stops that from becoming a duplicate row; the loser's insert
 * fails with P2002, caught below and folded into the same existing-row union path as if the game
 * had already been on the shelf before this import started, same pattern as sync-shelf-beaten's own
 * P2002 handling in games.ts. */
export async function applyResolvedIgdbEntry(
  userId: string,
  igdbId: number,
  entry: LibraryImportEntry,
  existingByIgdbId: Map<number, ResolvedShelfGame>,
): Promise<ResolvedShelfGame> {
  const existing = existingByIgdbId.get(igdbId);
  if (existing) {
    // It's in the Playnite library, so a Wishlist entry has been bought since: move it to the
    // Backlog (unless it's not out yet) before recording ownership.
    if (existing.status === 'wishlist' && (await promoteOwnedWishlistGames(userId, [igdbId])) > 0) existing.status = 'backlog';
    if (existing.status !== 'wishlist') await unionOwnershipPlatforms(userId, igdbId, entry.platforms);
    return existing;
  }

  const resolved = await resolveGameForCreation(igdbId);
  let created;
  try {
    created = await prisma.game.create({
      data: {
        roomId: null,
        addedBy: userId,
        igdbId,
        title: resolved.title,
        platform: resolved.platform,
        genre: resolved.genre,
        maxCoopPlayers: resolved.maxCoopPlayers,
        singlePlayerOnly: resolved.singlePlayerOnly,
        timeToBeatHours: resolved.timeToBeatHours,
        timeToBeatRushedHours: resolved.timeToBeatRushedHours,
        timeToBeatCompletionistHours: resolved.timeToBeatCompletionistHours,
        ggDealsUrl: resolved.ggDealsUrl,
        steamAppid: resolved.steamAppId,
        coverImageUrl: resolved.coverImageUrl,
        releaseYear: resolved.releaseYear,
        releaseDate: resolved.releaseDate,
        igdbCollectionId: resolved.igdbCollectionId,
        reviewScore: resolved.reviewScore,
        sensitiveContent: resolved.sensitiveContent,
        status: defaultStatusForRelease(resolved.releaseDate),
      },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    const winner = await prisma.game.findFirstOrThrow({ where: { roomId: null, addedBy: userId, igdbId } });
    const result = { id: winner.id, status: winner.status };
    existingByIgdbId.set(igdbId, result);
    if (result.status === 'wishlist' && (await promoteOwnedWishlistGames(userId, [igdbId])) > 0) result.status = 'backlog';
    if (result.status !== 'wishlist') await unionOwnershipPlatforms(userId, igdbId, entry.platforms);
    return result;
  }
  // Issue #338 precedent, same as the Steam import loop: a library commonly includes DLC
  // entries alongside their base game - ensure the base game is present too and link back.
  if (resolved.parentGameIgdbId && isAddonCategory(resolved.category)) {
    const base = await linkDlcToBaseGame(created.id, resolved.parentGameIgdbId, null, userId);
    if (base && !existingByIgdbId.has(base.baseIgdbId)) {
      existingByIgdbId.set(base.baseIgdbId, { id: base.baseGameId, status: 'backlog' });
      await unionOwnershipPlatforms(userId, base.baseIgdbId, entry.platforms);
    }
  }
  const result = { id: created.id, status: created.status };
  existingByIgdbId.set(igdbId, result);
  await setOwnershipPlatforms(userId, igdbId, entry.platforms);
  return result;
}
