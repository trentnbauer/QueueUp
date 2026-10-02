import type { AccountEventPage } from '@queueup/shared';
import { prisma } from '../db/client.js';

export const ACCOUNT_EVENT_PAGE_SIZE = 30;

/** Adds a line to the person's Account history. Best effort: it runs after the change itself has
 * already succeeded, so a failure here is logged and never thrown. */
export async function logAccountEvent(userId: string, type: string, message: string): Promise<void> {
  try {
    await prisma.accountEvent.create({ data: { userId, type, message } });
  } catch (err) {
    console.error('[accountEvents] failed to record account event', err);
  }
}

/** Newest first. `before` is the createdAt (ISO) of the last entry from the previous page. */
export async function getAccountEvents(userId: string, before?: string): Promise<AccountEventPage> {
  const cursor = before ? new Date(before) : null;
  const rows = await prisma.accountEvent.findMany({
    where: { userId, ...(cursor && !Number.isNaN(cursor.getTime()) ? { createdAt: { lt: cursor } } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: ACCOUNT_EVENT_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, ACCOUNT_EVENT_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    entries: page.map((r) => ({ id: r.id, type: r.type, message: r.message, createdAt: r.createdAt.toISOString() })),
    nextBefore: rows.length > ACCOUNT_EVENT_PAGE_SIZE && last ? last.createdAt.toISOString() : null,
  };
}
