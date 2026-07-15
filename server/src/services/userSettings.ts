import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { ROOM_PLATFORM_LABELS, type RoomPlatform } from '@squadqueue/shared';

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
