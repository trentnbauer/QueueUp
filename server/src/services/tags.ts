import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import type { Tag } from '@queueup/shared';

// Plenty of room for a real label ("Co-op only", "Short & sweet") while still keeping the filter
// pill / chip UI from being blown out by something pasted in by mistake.
const MAX_TAG_NAME_LENGTH = 40;

/** Trims whitespace and collapses internal runs of it, same normalization a free-text label like
 * this needs regardless of where it's entered from (inline-create in GameDetailModal today,
 * potentially elsewhere later) - centralized here rather than duplicated per call site. */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function assertValidTagName(name: string): void {
  if (!name) throw new HttpError(400, 'Tag name is required');
  if (name.length > MAX_TAG_NAME_LENGTH) {
    throw new HttpError(400, `Tag names can't be longer than ${MAX_TAG_NAME_LENGTH} characters`);
  }
}

function toTagDto(tag: { id: string; name: string; createdAt: Date }): Tag {
  return { id: tag.id, name: tag.name, createdAt: tag.createdAt.toISOString() };
}

export async function listTags(userId: string): Promise<Tag[]> {
  const tags = await prisma.tag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  return tags.map(toTagDto);
}

/** Only the tag's owner can ever look it up this way - callers pass this straight to a 404 (not a
 * 403) so a rename/delete attempt against someone else's tag id doesn't confirm it exists. */
export async function loadOwnTagOr404(tagId: string, userId: string) {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
  if (!tag) throw new HttpError(404, 'Tag not found');
  return tag;
}

/** Creates a new tag for `userId`. Thin wrapper around a plain `create` (not a check-then-insert)
 * so the @@unique([userId, name]) constraint is the single source of truth for "does this name
 * already exist" - callers catch the P2002 this throws on a collision (see routes/tags.ts) rather
 * than racing a separate existence check. */
export async function createTag(userId: string, rawName: string): Promise<Tag> {
  const name = normalizeTagName(rawName);
  assertValidTagName(name);
  const tag = await prisma.tag.create({ data: { userId, name } });
  return toTagDto(tag);
}

/** Finds the caller's existing tag with this name, or creates it - backs the "type a tag and hit
 * enter" apply flow (ApplyTagRequest) so it's one request instead of create-then-apply. Races the
 * same way createTag does: on a concurrent create of the same name, the loser's P2002 is caught and
 * resolved to the winner's row rather than erroring, the same pattern used for room-join races in
 * routes/rooms.ts. */
export async function findOrCreateTag(userId: string, rawName: string) {
  const name = normalizeTagName(rawName);
  assertValidTagName(name);
  try {
    return await prisma.tag.create({ data: { userId, name } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.tag.findUniqueOrThrow({ where: { userId_name: { userId, name } } });
    }
    throw err;
  }
}
