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
