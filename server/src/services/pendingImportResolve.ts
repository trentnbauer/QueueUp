import { prisma } from '../db/client.js';
import { recordSyncSources } from './syncSources.js';
import { createGameForUser } from './gameIntake.js';
import { unionOwnershipPlatforms } from './gameOwnership.js';
import { deletePendingLibraryImport, recordTitleMatchAlias, recordTitleMatchSuggestion, userAliasSource } from './playniteImport.js';
import type { SyncSource } from '@queueup/shared';

const SYNC_SOURCES: SyncSource[] = ['playnite', 'xbox', 'exophase', 'psn', 'retroachievements'];

export function isSyncSource(source: string): source is SyncSource {
  return (SYNC_SOURCES as string[]).includes(source);
}

type PendingPlatforms = Parameters<typeof unionOwnershipPlatforms>[2];

/** Puts one resolved game on the person's shelf as owned, or adds the platforms to the copy that is
 * already there (same wishlist guard as the bulk import loop - see the resolve route's comment). */
export async function addResolvedGame(userId: string, pending: { platforms: PendingPlatforms }, igdbId: number): Promise<void> {
  const existing = await prisma.game.findFirst({ where: { roomId: null, addedBy: userId, igdbId } });
  if (existing) {
    if (existing.status !== 'wishlist') {
      await unionOwnershipPlatforms(userId, igdbId, pending.platforms);
    }
  } else {
    await createGameForUser(userId, null, igdbId, { status: 'backlog', ownedPlatforms: pending.platforms });
  }
}

/** Resolves one pending row to the chosen game: adds it, remembers the match for next time, and
 * removes the row. Shared by the manual resolve route and the AI auto-match. */
export async function resolvePendingImport(
  userId: string,
  pending: { id: string; source: string; title: string; platforms: PendingPlatforms },
  igdbId: number,
): Promise<void> {
  await addResolvedGame(userId, pending, igdbId);
  if (isSyncSource(pending.source)) await recordSyncSources(userId, [igdbId], pending.source);
  await recordTitleMatchAlias(userAliasSource(pending.source, userId), pending.title, igdbId);
  await recordTitleMatchSuggestion(pending.source, pending.title, igdbId, userId);
  await deletePendingLibraryImport(userId, pending.id);
}
