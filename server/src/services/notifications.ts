import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { toUserDto } from '../util/dto.js';
import { logRoomActivity } from './roomActivity.js';
import type { Notification } from '@queueup/shared';

async function actorDisplayName(actorId: string): Promise<string> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { displayName: true } });
  return actor?.displayName ?? 'Someone';
}

/** Posts the same message a room notification carries out to that room's Discord webhook, if one
 * is configured (issue #181) - one-way egress only, nothing reads anything back from Discord.
 * Best-effort: a webhook failure (bad URL, Discord outage, channel/webhook deleted) must never
 * affect the in-app notification it's mirroring, so this always swallows its own errors. */
async function postToDiscordWebhook(roomId: string, roomName: string, content: string): Promise<void> {
  try {
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { discordWebhookUrl: true } });
    if (!room?.discordWebhookUrl) return;

    await fetch(room.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: roomName, content }),
    });
  } catch (err) {
    console.error('[notifications] failed to post to Discord webhook', err);
  }
}

interface NotifyRoomInput {
  roomId: string;
  roomName: string;
  actorId: string;
  // Excludes room_deleted/price_drop/release_watch (none of the three ever reaches notifyRoom -
  // see the notes on notifyRoomMembersDirect, notifyPriceDrop, and notifyReleaseWatch below) so
  // the RoomActivityType passthrough a few lines down needs no cast: this narrowed type is
  // compiler-checked to stay a subset of RoomActivityType, not just documented as one.
  type: Exclude<NotificationType, 'room_deleted' | 'price_drop' | 'release_watch'>;
  message: (actorName: string) => string;
}

/** Writes a room-scoped notification. The actor never sees their own action as unread (see
 * `serializeNotification` and `getNotificationSummary`, which exclude a member's own actorId from
 * their own unread count) - deliberately not implemented by bumping the actor's read cutoff here,
 * since that would also silently mark any *other* pending notification in the room as read for
 * them as a side effect.
 *
 * Failures are logged and swallowed rather than thrown: this always runs after the request's
 * primary write has already committed (the game was added, the room was renamed, ...), and a
 * notification-delivery hiccup shouldn't turn that already-successful action into a client-visible
 * error. */
export async function notifyRoom(input: NotifyRoomInput): Promise<void> {
  try {
    const actorName = await actorDisplayName(input.actorId);
    const message = input.message(actorName);
    await prisma.notification.create({
      data: {
        roomId: input.roomId,
        roomName: input.roomName,
        actorId: input.actorId,
        type: input.type,
        message,
      },
    });
    void postToDiscordWebhook(input.roomId, input.roomName, message);
    // Room activity feed (issue #509) - every notifyRoom event is also feed-worthy; input.type's
    // narrowed type (see NotifyRoomInput above) makes this a plain assignment, no cast needed.
    // logRoomActivity has its own independent try/catch, so a feed-write hiccup here can't mask or
    // roll back the notification write above.
    void logRoomActivity({ roomId: input.roomId, actorId: input.actorId, type: input.type, message: () => message });
  } catch (err) {
    console.error('[notifications] failed to write room notification', err);
  }
}

interface NotifyRoomMembersDirectInput {
  roomName: string;
  actorId: string;
  /** Member ids to notify - gather these BEFORE deleting the room, since its RoomMember rows
   * cascade-delete along with it. */
  recipientIds: string[];
  type: NotificationType;
  message: (actorName: string) => string;
}

/** Writes one direct notification per recipient, addressed to them individually rather than
 * through roomId - used only for events where the room itself no longer exists to attach a
 * shared, room-scoped notification to (namely room_deleted).
 *
 * Like notifyRoom, failures are logged and swallowed rather than thrown - this runs after the room
 * has already been deleted, so there's no primary action left to protect, but a notification
 * failure still shouldn't turn an already-completed deletion into a client-visible error. */
export async function notifyRoomMembersDirect(input: NotifyRoomMembersDirectInput): Promise<void> {
  const recipientIds = input.recipientIds.filter((id) => id !== input.actorId);
  if (recipientIds.length === 0) return;

  try {
    const actorName = await actorDisplayName(input.actorId);
    const message = input.message(actorName);
    await prisma.notification.createMany({
      data: recipientIds.map((recipientId) => ({
        recipientId,
        roomName: input.roomName,
        actorId: input.actorId,
        type: input.type,
        message,
      })),
    });
  } catch (err) {
    console.error('[notifications] failed to write direct notifications', err);
  }
}

interface NotifyPriceDropInput {
  title: string;
  amount: string;
  currency: string | null;
  /** Set for a room game (notifies every member); null for a Personal Shelf game (notifies just
   * its owner via ownerId). */
  room: { roomId: string; roomName: string } | null;
  ownerId: string;
  /** Which alert fired - drives the message wording. Defaults to 'target' (the original,
   * user-set-threshold alert); 'atl' is for hitting a new all-time low regardless of any target. */
  reason?: 'target' | 'atl';
}

/** Writes a price-drop alert - system-generated (no actorId), so unlike notifyRoom this always
 * counts as unread for every recipient, including whoever originally set the target price.
 * Failures are logged and swallowed, same as notifyRoom: this runs after the price check has
 * already cleared the target, so there's no primary write left to protect. */
export async function notifyPriceDrop(input: NotifyPriceDropInput): Promise<void> {
  const formatted = input.currency ? `${input.amount} ${input.currency}` : input.amount;
  const message =
    input.reason === 'atl'
      ? `"${input.title}" hit a new all-time low - now ${formatted}`
      : `"${input.title}" hit your target price - now ${formatted}`;

  try {
    if (input.room) {
      await prisma.notification.create({
        data: { roomId: input.room.roomId, roomName: input.room.roomName, type: 'price_drop', message },
      });
      void postToDiscordWebhook(input.room.roomId, input.room.roomName, message);
      // System-generated (no actorId), same as the notification just above.
      void logRoomActivity({ roomId: input.room.roomId, actorId: null, type: 'price_drop', message: () => message });
    } else {
      await prisma.notification.create({
        data: { recipientId: input.ownerId, roomName: 'Personal Shelf', type: 'price_drop', message },
      });
    }
  } catch (err) {
    console.error('[notifications] failed to write price drop notification', err);
  }
}

/** Writes a release-watch alert (issue #510, see jobs/releaseWatchJob.ts) - always a direct,
 * Personal-Shelf-scoped notification (no room), same shape as notifyPriceDrop's non-room branch,
 * and system-generated (no actorId) for the same "always unread" reason. Takes an already-built
 * message rather than the raw discoveries themselves - releaseWatch.ts owns formatting that (see
 * formatReleaseWatchMessage there), so this stays a thin write with no import back on that module.
 * Failures are logged and swallowed: the caller has already durably recorded
 * (ReleaseWatchNotification) that this was decided before calling this, so a delivery hiccup here
 * must not cause the same title to be silently re-discovered and re-attempted on the next run. */
export async function notifyReleaseWatch(userId: string, message: string): Promise<void> {
  try {
    await prisma.notification.create({
      data: { recipientId: userId, roomName: 'Personal Shelf', type: 'release_watch', message },
    });
  } catch (err) {
    console.error('[notifications] failed to write release watch notification', err);
  }
}

type NotificationWithActor = Prisma.NotificationGetPayload<{ include: { actor: true } }>;

interface ReadCutoff {
  notificationsReadAt: Date | null;
  joinedAt: Date;
}

export function serializeNotification(row: NotificationWithActor, currentUserId: string, cutoffByRoomId: Map<string, ReadCutoff>): Notification {
  const read =
    row.actorId === currentUserId ||
    (row.recipientId
      ? row.readAt != null
      : (() => {
          const cutoff = row.roomId ? cutoffByRoomId.get(row.roomId) : undefined;
          const readAt = cutoff?.notificationsReadAt ?? cutoff?.joinedAt;
          return readAt != null && row.createdAt <= readAt;
        })());

  return {
    id: row.id,
    roomId: row.roomId,
    roomName: row.roomName,
    type: row.type,
    message: row.message,
    actor: row.actor ? toUserDto(row.actor) : null,
    createdAt: row.createdAt.toISOString(),
    read,
  };
}

/** Prisma OR-branches matching serializeNotification's own unread predicate, mirrored 1:1 (keep
 * both in sync if that logic changes) - so getNotificationFeed's `take` cap lands on the newest
 * *unread* notifications instead of the newest notifications overall. Issue #520: previously the
 * query took the newest `take` rows with no unread predicate at all, then filtered to unread in
 * JS afterward - so an older unread notification could fall entirely outside that window (e.g. 50+
 * newer notifications elsewhere) and silently never appear in the feed, even though the unread
 * count (getNotificationSummary, a correct DB-level query) still counted it. One room-scoped
 * condition per membership (its own read cutoff) plus one recipient-scoped condition; a
 * notification's own actor is always "read" for them regardless of cutoff, same as
 * serializeNotification. */
export function unreadNotificationWhere(
  userId: string,
  memberships: { roomId: string; notificationsReadAt: Date | null; joinedAt: Date }[],
): Prisma.NotificationWhereInput {
  return {
    OR: [
      ...memberships.map((m) => ({
        roomId: m.roomId,
        actorId: { not: userId },
        createdAt: { gt: m.notificationsReadAt ?? m.joinedAt },
      })),
      { recipientId: userId, actorId: { not: userId }, readAt: null },
    ],
  };
}

/** The merged, most-recent UNREAD notification feed for a user: their rooms' shared notifications
 * plus any direct ones (room-deletion notices), newest first. Only unread ones are returned - a
 * read notification has nothing left to act on, and "Dismiss all" (markAllNotificationsRead) needs
 * this list to actually go empty afterward rather than just losing its unread highlight. */
export async function getNotificationFeed(userId: string, take = 50): Promise<Notification[]> {
  const memberships = await prisma.roomMember.findMany({
    where: { userId },
    select: { roomId: true, notificationsReadAt: true, joinedAt: true },
  });
  const cutoffByRoomId = new Map(memberships.map((m) => [m.roomId, { notificationsReadAt: m.notificationsReadAt, joinedAt: m.joinedAt }]));

  const rows = await prisma.notification.findMany({
    where: unreadNotificationWhere(userId, memberships),
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take,
  });

  // The where clause already selects only-unread rows; re-deriving `read` here (rather than
  // trusting that) keeps this in exact lockstep with serializeNotification's own definition of
  // "read" if the two ever drift, same defensive intent the previous JS-side filter had.
  return rows
    .map((row: NotificationWithActor) => serializeNotification(row, userId, cutoffByRoomId))
    .filter((n) => !n.read);
}

/** Unread counts for the sidebar: a dot per oversized-in-notifications room icon, plus a total for
 * the QU button badge. Computed per-membership rather than a single grouped query, since each
 * room's unread cutoff differs by member (their own notificationsReadAt/joinedAt). */
export async function getNotificationSummary(userId: string): Promise<{ totalUnread: number; rooms: { roomId: string; unreadCount: number }[] }> {
  const memberships = await prisma.roomMember.findMany({
    where: { userId },
    select: { roomId: true, notificationsReadAt: true, joinedAt: true },
  });

  const [roomCounts, directUnread] = await Promise.all([
    Promise.all(
      memberships.map(async (m) => ({
        roomId: m.roomId,
        // A member's own actions never count toward their own unread badge (see notifyRoom).
        unreadCount: await prisma.notification.count({
          where: { roomId: m.roomId, actorId: { not: userId }, createdAt: { gt: m.notificationsReadAt ?? m.joinedAt } },
        }),
      })),
    ),
    prisma.notification.count({ where: { recipientId: userId, readAt: null } }),
  ]);

  const rooms = roomCounts.filter((r) => r.unreadCount > 0);
  const totalUnread = directUnread + roomCounts.reduce((sum, r) => sum + r.unreadCount, 0);
  return { totalUnread, rooms };
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.roomMember.updateMany({ where: { userId }, data: { notificationsReadAt: now } }),
    prisma.notification.updateMany({ where: { recipientId: userId, readAt: null }, data: { readAt: now } }),
  ]);
}

export async function markRoomNotificationsRead(roomId: string, userId: string): Promise<void> {
  await prisma.roomMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { notificationsReadAt: new Date() },
  });
}
