import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { ROOM_PLATFORM_LABELS, type RoomPlatform } from '@queueup/shared';
import { logShelfActivity } from './roomActivity.js';

/** One friends-feed / shelf-history entry for each system that was just added. */
function logConsolesAdded(userId: string, added: RoomPlatform[]): void {
  for (const platform of added) {
    const label = ROOM_PLATFORM_LABELS[platform];
    void logShelfActivity({
      recipientId: userId,
      actorId: userId,
      type: 'console_added',
      message: `Added ${label} to your systems`,
      payload: { title: label, platform },
    });
  }
}

export const VALID_PLATFORMS = new Set(Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[]);

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
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { ownedPlatforms: true } });
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ownedPlatforms: deduped },
  });
  const had = new Set(before?.ownedPlatforms ?? []);
  logConsolesAdded(userId, deduped.filter((p) => !had.has(p)));
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
  logConsolesAdded(userId, platforms.filter((p) => !user.ownedPlatforms.includes(p)));
  return updated.ownedPlatforms;
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

/** Normalizes and validates a vanity profile name; returns null to clear it. Throws a 400 with a
 * message the settings UI shows as-is. Rejects anything shaped like a user id so a slug can never
 * shadow `/u/<id>`. */
export function normalizeProfileSlug(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw new HttpError(400, 'Profile name must be text');
  const slug = raw.trim().toLowerCase();
  if (slug === '') return null;
  if (!SLUG_RE.test(slug)) {
    throw new HttpError(400, 'Use 3 to 30 letters, numbers or hyphens, starting and ending with a letter or number');
  }
  if (UUID_LIKE.test(slug)) throw new HttpError(400, 'Pick a different profile name');
  return slug;
}

/** Sets (or clears) the vanity profile name. */
export async function setProfileSlug(userId: string, raw: unknown): Promise<string | null> {
  const slug = normalizeProfileSlug(raw);
  try {
    const updated = await prisma.user.update({ where: { id: userId }, data: { profileSlug: slug } });
    return updated.profileSlug;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new HttpError(409, 'That profile name is taken');
    }
    throw err;
  }
}

/** Toggles the public profile opt-in (issue #511) - see User.publicProfileEnabled's schema doc for
 * what this actually gates. */
export async function setPublicProfileEnabled(userId: string, enabled: unknown): Promise<boolean> {
  if (typeof enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean');
  const updated = await prisma.user.update({ where: { id: userId }, data: { publicProfileEnabled: enabled } });
  return updated.publicProfileEnabled;
}
