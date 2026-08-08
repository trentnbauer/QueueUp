import type { RoomActivityType } from '@prisma/client';
import { prisma } from '../db/client.js';

async function actorDisplayName(actorId: string | null): Promise<string> {
  if (!actorId) return 'Someone';
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { displayName: true } });
  return actor?.displayName ?? 'Someone';
}

interface LogRoomActivityInput {
  roomId: string;
  actorId: string | null;
  type: RoomActivityType;
  /** Same shape as notifyRoom's message builder (services/notifications.ts) - callers that already
   * have a resolved actor name (notifyRoom/notifyPriceDrop forwarding into here) just pass a
   * constant `() => message`; everyone else gets it resolved for free. */
  message: (actorName: string) => string;
}

/** Writes one RoomActivity row (issue #509) - see RoomActivity's schema doc for why this is a
 * separate table from Notification. Failures are logged and swallowed, same reasoning as
 * notifyRoom: this always runs after the request's primary write has already committed, so a
 * feed-write hiccup shouldn't turn an already-successful action into a client-visible error. */
export async function logRoomActivity(input: LogRoomActivityInput): Promise<void> {
  try {
    const actorName = await actorDisplayName(input.actorId);
    const message = input.message(actorName);
    await prisma.roomActivity.create({
      data: { roomId: input.roomId, actorId: input.actorId, type: input.type, message },
    });
  } catch (err) {
    console.error('[roomActivity] failed to write activity log entry', err);
  }
}

export interface ActivityCursor {
  createdAt: Date;
  id: string;
}

/** Opaque cursor for GET /api/rooms/:roomId/activity's `before` query param - `${iso}_${id}`.
 * Safe to split on the last `_`: an ISO-8601 timestamp never contains one, and RoomActivity's id
 * is a uuid (hyphens only). */
export function encodeActivityCursor(cursor: ActivityCursor): string {
  return `${cursor.createdAt.toISOString()}_${cursor.id}`;
}

export function decodeActivityCursor(raw: string): ActivityCursor | undefined {
  const idx = raw.lastIndexOf('_');
  if (idx === -1) return undefined;
  const createdAt = new Date(raw.slice(0, idx));
  if (Number.isNaN(createdAt.getTime())) return undefined;
  return { createdAt, id: raw.slice(idx + 1) };
}

export interface LogShelfActivityInput {
  recipientId: string;
  actorId: string | null;
  /** Narrowed to the RoomActivityTypes that make sense with no room around them (issue #580) -
   * member/vote/spin/room-management types all assume membership, a shared spin session, or
   * voting, none of which exist on a Personal Shelf. Callers get this enforced statically rather
   * than by convention alone, same reasoning as NotifyRoomInput's `type` narrowing in
   * notifications.ts. */
  type: Extract<RoomActivityType, 'game_added' | 'status_changed' | 'price_drop'>;
  message: string;
}

/** Personal Shelf counterpart to logRoomActivity (issue #580) - same RoomActivity table, scoped by
 * recipientId instead of roomId (see the model's schema doc for the roomId/recipientId split).
 * Unlike logRoomActivity's `message` callback, there's only ever one possible actor for a shelf
 * entry (its own recipient, or nobody for a system-generated price_drop) - no name to resolve, so
 * callers just pass the finished string. Same fire-and-forget, failures-swallowed contract as
 * logRoomActivity - this always runs after the request's primary write has already committed. */
export async function logShelfActivity(input: LogShelfActivityInput): Promise<void> {
  try {
    await prisma.roomActivity.create({
      data: { recipientId: input.recipientId, actorId: input.actorId, type: input.type, message: input.message },
    });
  } catch (err) {
    console.error('[roomActivity] failed to write shelf activity log entry', err);
  }
}

/** One page of a room's activity feed, newest first - see GET /api/rooms/:roomId/activity. Keyset
 * (createdAt, id) pagination rather than a plain `createdAt < before`: logRoomActivity calls are
 * fire-and-forget and several call sites (e.g. a status change plus its notifyRoom-driven sibling
 * row) can land in the same request, so a createdAt-only cursor risks landing exactly on a tie and
 * silently skipping every row sharing that timestamp. `id` is a uuid, not sequential, so it's only
 * used to break ties among rows with the same createdAt, never to order across different ones -
 * see the `@@index([roomId, createdAt])` on RoomActivity in schema.prisma, which this still uses
 * for the createdAt half of the comparison. No separate unread/read split, unlike Notification's
 * feed: there's no read state here at all, just history to page back through. */
export async function getRoomActivityPage(
  roomId: string,
  options: { before?: ActivityCursor; take: number },
): Promise<
  {
    id: string;
    type: RoomActivityType;
    message: string;
    createdAt: Date;
    actor: { id: string; displayName: string; avatarColor: string; avatarUrl: string | null; isAdmin: boolean } | null;
  }[]
> {
  const { before } = options;
  return prisma.roomActivity.findMany({
    where: {
      roomId,
      ...(before
        ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.take,
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
      actor: { select: { id: true, displayName: true, avatarColor: true, avatarUrl: true, isAdmin: true } },
    },
  });
}

/** One page of a user's Personal Shelf activity feed (issue #580), newest first - see GET
 * /api/me/activity. Same keyset (createdAt, id) pagination as getRoomActivityPage above, and for
 * the same reason (fire-and-forget logShelfActivity calls can tie on createdAt within one
 * request) - see that function's doc comment, which this still relies on for the createdAt half of
 * the comparison via the `@@index([recipientId, createdAt])` on RoomActivity. No `actor` in the
 * result, unlike getRoomActivityPage: a shelf entry's only possible actor is its own recipient (or
 * nobody, for a system-generated price_drop), so there's no separate identity worth surfacing. */
export async function getShelfActivityPage(
  recipientId: string,
  options: { before?: ActivityCursor; take: number },
): Promise<{ id: string; type: RoomActivityType; message: string; createdAt: Date }[]> {
  const { before } = options;
  return prisma.roomActivity.findMany({
    where: {
      recipientId,
      ...(before
        ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.take,
    select: { id: true, type: true, message: true, createdAt: true },
  });
}
