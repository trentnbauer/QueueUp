import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import type { UpdateYearStoryRequest, YearStoryDto } from '@queueup/shared';

export const MAX_EDITED_STORY_LENGTH = 2000;

export const userScope = (userId: string) => `user:${userId}`;
export const roomScope = (roomId: string) => `room:${roomId}`;

type Row = { text: string; edited: boolean; hidden: boolean; sharedOnProfile: boolean; generatedAt: Date; updatedAt: Date };

export function toStoryDto(row: Row, canManage: boolean): YearStoryDto {
  return {
    text: row.text,
    edited: row.edited,
    hidden: row.hidden,
    sharedOnProfile: row.sharedOnProfile,
    generatedAt: row.generatedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canManage,
  };
}

/** Saves a freshly generated story, replacing any earlier one: it is no longer edited and not hidden,
 * but a person's choice to share it on their profile is kept. */
export async function saveGeneratedStory(scopeKey: string, owner: { userId: string; roomId?: string }, text: string): Promise<Row> {
  return prisma.yearStory.upsert({
    where: { scopeKey },
    create: { scopeKey, userId: owner.userId, roomId: owner.roomId ?? null, text },
    update: { text, edited: false, hidden: false, userId: owner.userId, generatedAt: new Date() },
  });
}

/** Applies an edit, hide or share change. Changing the text marks it edited (no longer AI-written). */
export async function updateStory(scopeKey: string, body: UpdateYearStoryRequest | undefined, allowShare: boolean): Promise<Row> {
  const existing = await prisma.yearStory.findUnique({ where: { scopeKey } });
  if (!existing) throw new HttpError(404, 'There is no recap to change yet.');
  const data: { text?: string; edited?: boolean; hidden?: boolean; sharedOnProfile?: boolean } = {};
  if (body?.text !== undefined) {
    if (typeof body.text !== 'string') throw new HttpError(400, 'text must be a string');
    const text = body.text.trim();
    if (!text) throw new HttpError(400, 'The recap cannot be empty. Hide or delete it instead.');
    if (text.length > MAX_EDITED_STORY_LENGTH) throw new HttpError(400, `The recap can be at most ${MAX_EDITED_STORY_LENGTH} characters.`);
    if (text !== existing.text) {
      data.text = text;
      data.edited = true;
    }
  }
  if (body?.hidden !== undefined) {
    if (typeof body.hidden !== 'boolean') throw new HttpError(400, 'hidden must be true or false');
    data.hidden = body.hidden;
  }
  if (body?.sharedOnProfile !== undefined) {
    if (!allowShare) throw new HttpError(400, 'Only a personal recap can be shared on a profile.');
    if (typeof body.sharedOnProfile !== 'boolean') throw new HttpError(400, 'sharedOnProfile must be true or false');
    data.sharedOnProfile = body.sharedOnProfile;
  }
  return prisma.yearStory.update({ where: { scopeKey }, data });
}
