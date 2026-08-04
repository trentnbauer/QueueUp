import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { ROOM_PLATFORM_LABELS, type RoomPlatform } from '@queueup/shared';

const VALID_PLATFORMS = new Set(Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[]);

/** The systems a user has ticked as "owned" for their Personal Shelf - empty means no opt-in yet,
 * i.e. no filtering should be applied to the add-game flow there. */
export async function getOwnedPlatforms(userId: string): Promise<RoomPlatform[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return user.ownedPlatforms;
}

export async function setOwnedPlatforms(userId: string, platforms: unknown): Promise<RoomPlatform[]> {
  if (!Array.isArray(platforms) || platforms.some((p) => typeof p !== 'string' || !VALID_PLATFORMS.has(p as RoomPlatform))) {
    throw new HttpError(400, 'platforms must be an array of valid platform values');
  }
  // Dedupe, and drop the DB round trip if nothing actually changed.
  const deduped = Array.from(new Set(platforms as RoomPlatform[]));
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ownedPlatforms: deduped },
  });
  return updated.ownedPlatforms;
}

/** Adds platforms to a user's "systems I own" setting without removing any they've already ticked
 * - used to auto-tick a system when a library import (e.g. Playnite) reports games on it, so a
 * user who's clearly playing on a system they never got around to ticking manually doesn't stay
 * filtered out of it (see ROOM_PLATFORM_LABELS / ProfileSettingsView's "Systems owned" list, the
 * same setting this writes to). A no-op, not an error, for platforms already ticked. */
export async function unionOwnedPlatforms(userId: string, platforms: RoomPlatform[]): Promise<RoomPlatform[]> {
  if (platforms.length === 0) return getOwnedPlatforms(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const merged = Array.from(new Set([...user.ownedPlatforms, ...platforms]));
  if (merged.length === user.ownedPlatforms.length) return user.ownedPlatforms;
  const updated = await prisma.user.update({ where: { id: userId }, data: { ownedPlatforms: merged } });
  return updated.ownedPlatforms;
}
