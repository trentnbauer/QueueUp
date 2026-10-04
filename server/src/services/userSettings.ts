import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { PROFILE_VISIBILITIES, ROOM_PLATFORM_LABELS, type ProfileVisibility, type RoomPlatform } from '@queueup/shared';
import { logShelfActivity } from './roomActivity.js';
import { logAccountEvent } from './accountEvents.js';

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
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { ownedPlatforms: true, dismissedPlatforms: true, declinedPlatforms: true } });
  const had = new Set(before?.ownedPlatforms ?? []);
  const added = deduped.filter((p) => !had.has(p));
  const removed = [...had].filter((p) => !deduped.includes(p));
  // An unticked console stays unticked through library syncs (they ask instead, see
  // unionOwnedPlatforms); ticking it again clears that.
  const dismissed = Array.from(new Set([...(before?.dismissedPlatforms ?? []), ...removed])).filter((p) => !deduped.includes(p));
  const declined = (before?.declinedPlatforms ?? []).filter((p) => !deduped.includes(p) && !removed.includes(p));
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ownedPlatforms: deduped, dismissedPlatforms: dismissed, declinedPlatforms: declined },
  });
  logConsolesAdded(userId, added);
  if (added.length > 0 || removed.length > 0) {
    const names = (list: RoomPlatform[]) => list.map((p) => ROOM_PLATFORM_LABELS[p]).join(', ');
    const parts = [added.length > 0 && `added ${names(added)}`, removed.length > 0 && `removed ${names(removed)}`].filter(Boolean);
    void logAccountEvent(userId, 'owned_systems', `Systems owned: ${parts.join('; ')}.`);
  }
  return updated.ownedPlatforms;
}

/** Adds platforms to a user's "systems I own" setting without removing any they've already ticked
 * - used to auto-tick a system when a library import (e.g. Playnite) reports games on it, so a
 * user who's clearly playing on a system they never got around to ticking manually doesn't stay
 * filtered out of it (see ROOM_PLATFORM_LABELS / ProfileSettingsView's "Systems owned" list, the
 * same setting this writes to). A no-op, not an error, for platforms already ticked.
 *
 * A console the person unticked themselves is never ticked again this way: they get a
 * platform_unowned notification asking whether to add it (once per console, until they answer). */
export async function unionOwnedPlatforms(userId: string, platforms: RoomPlatform[], source = 'A library sync'): Promise<RoomPlatform[]> {
  if (platforms.length === 0) return getOwnedPlatforms(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const unticked = [...new Set(platforms)].filter((p) => user.dismissedPlatforms.includes(p) && !user.ownedPlatforms.includes(p));
  for (const platform of unticked) {
    if (user.declinedPlatforms.includes(platform)) continue;
    const asked = await prisma.notification.count({ where: { recipientId: userId, type: 'platform_unowned', platform, readAt: null } });
    if (asked) continue;
    const name = ROOM_PLATFORM_LABELS[platform];
    await prisma.notification.create({
      data: {
        recipientId: userId,
        roomName: 'Personal Shelf',
        type: 'platform_unowned',
        platform,
        message: `${source} found games for ${name}, which isn't in your Systems owned. Add ${name}?`,
      },
    });
  }
  platforms = platforms.filter((p) => !unticked.includes(p));
  if (platforms.length === 0) return user.ownedPlatforms;
  const merged = Array.from(new Set([...user.ownedPlatforms, ...platforms]));
  if (merged.length === user.ownedPlatforms.length) return user.ownedPlatforms;
  const updated = await prisma.user.update({ where: { id: userId }, data: { ownedPlatforms: merged } });
  const newlyAdded = platforms.filter((p) => !user.ownedPlatforms.includes(p));
  logConsolesAdded(userId, newlyAdded);
  void logAccountEvent(userId, 'owned_systems', `Systems owned: added ${[...new Set(newlyAdded)].map((p) => ROOM_PLATFORM_LABELS[p]).join(', ')} (from a library sync).`);
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

/** Who can open the profile page (public / friends / private). publicProfileEnabled is kept in step
 * for anything still reading the old column. */
export async function setProfileVisibility(userId: string, raw: unknown): Promise<ProfileVisibility> {
  if (typeof raw !== 'string' || !(PROFILE_VISIBILITIES as readonly string[]).includes(raw)) {
    throw new HttpError(400, 'Visibility must be public, friends or private');
  }
  const visibility = raw as ProfileVisibility;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { profileVisibility: visibility, publicProfileEnabled: visibility === 'public' },
  });
  return updated.profileVisibility;
}

/** Toggles the public profile opt-in (issue #511) - see User.publicProfileEnabled's schema doc for
 * what this actually gates. */
export async function setPublicProfileEnabled(userId: string, enabled: unknown): Promise<boolean> {
  if (typeof enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean');
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { publicProfileEnabled: enabled, profileVisibility: enabled ? 'public' : 'friends' },
  });
  return updated.publicProfileEnabled;
}

/** The answer to a platform_unowned notification: Yes ticks the console in Systems owned, No stops
 * asking about it (until it's ticked and unticked again). Either way the question is marked read. */
export async function answerUnownedPlatform(userId: string, platform: RoomPlatform, add: boolean): Promise<RoomPlatform[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.notification.updateMany({ where: { recipientId: userId, type: 'platform_unowned', platform, readAt: null }, data: { readAt: new Date() } });
  if (add) return setOwnedPlatforms(userId, [...user.ownedPlatforms, platform]);
  if (!user.declinedPlatforms.includes(platform)) {
    await prisma.user.update({ where: { id: userId }, data: { declinedPlatforms: { push: platform } } });
  }
  return user.ownedPlatforms;
}
