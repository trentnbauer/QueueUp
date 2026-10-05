import type { Prisma } from '@prisma/client';
import { HttpError } from '../../util/httpError.js';

/** AI calls one request makes at once. A few in parallel keeps a long queue quick without one
 * request running long enough for a proxy to cut it off; the browser asks again for the next chunk
 * until the cursor runs out, so one button press still covers everything waiting. */
export const AI_BATCHES_PER_REQUEST = 3;

/** Newest first, with the id as a tie-break so the order (and so the cursor) is stable. */
export const PENDING_ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([\w-]{1,64})$/;

/** Where to carry on: the position of the last row a request looked at. Keyed on the row's own
 * place in the order rather than a row id, so it still works after that row was matched away. */
export const pendingCursor = (row: { createdAt: Date; id: string }): string => `${row.createdAt.toISOString()}|${row.id}`;

/** A person's waiting (not skipped) imports, or the ones after `after` in the order. */
export function pendingWhere(userId: string, after?: string | null): Prisma.PendingLibraryImportWhereInput {
  const base: Prisma.PendingLibraryImportWhereInput = { userId, dismissedAt: null };
  if (!after) return base;
  const match = CURSOR_RE.exec(after);
  if (!match) throw new HttpError(400, 'That position is not valid');
  const createdAt = new Date(match[1]);
  if (Number.isNaN(createdAt.getTime())) throw new HttpError(400, 'That position is not valid');
  return { ...base, OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: match[2] } }] };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The message to show when part of a run stopped (a provider error, or the daily limit on the
 * shared AI). */
export function stopReason(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'The AI could not finish';
}
