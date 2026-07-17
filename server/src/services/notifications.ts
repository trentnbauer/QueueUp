import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { toUserDto } from '../util/dto.js';
import type { Notification } from '@squadqueue/shared';

async function actorDisplayName(actorId: string): Promise<string> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { displayName: true } });
  return actor?.displayName ?? 'Someone';
}

interface NotifyRoomInput {
  roomId: string;
  roomName: string;
  actorId: string;
  type: NotificationType;
  message: (actorName: string) => string;
}

/** Writes a room-scoped notification and, in the same beat, marks the room "read" for whoever just
 * caused it - the acting member was just there, so their own action shouldn't ding their own
 * unread badge. Every other member sees the notification via the normal unread cutoff. */
export async function notifyRoom(input: NotifyRoomInput): Promise<void> {
  const actorName = await actorDisplayName(input.actorId);
  const now = new Date();
  await prisma.$transaction([
    prisma.notification.create({
      data: {
        roomId: input.roomId,
        roomName: input.roomName,
        actorId: input.actorId,
        type: input.type,
        message: input.message(actorName),
        createdAt: now,
      },
    }),
    prisma.roomMember.update({
      where: { roomId_userId: { roomId: input.roomId, userId: input.actorId } },
      data: { notificationsReadAt: now },
    }),
  ]);
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
 * shared, room-scoped notification to (namely room_deleted). */
export async function notifyRoomMembersDirect(input: NotifyRoomMembersDirectInput): Promise<void> {
  const recipientIds = input.recipientIds.filter((id) => id !== input.actorId);
  if (recipientIds.length === 0) return;

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
}

type NotificationWithActor = Prisma.NotificationGetPayload<{ include: { actor: true } }>;

interface ReadCutoff {
  notificationsReadAt: Date | null;
  joinedAt: Date;
}

export function serializeNotification(row: NotificationWithActor, cutoffByRoomId: Map<string, ReadCutoff>): Notification {
  const read = row.recipientId
    ? row.readAt != null
    : (() => {
        const cutoff = row.roomId ? cutoffByRoomId.get(row.roomId) : undefined;
        const readAt = cutoff?.notificationsReadAt ?? cutoff?.joinedAt;
        return readAt != null && row.createdAt <= readAt;
      })();

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

/** The merged, most-recent notification feed for a user: their rooms' shared notifications plus
 * any direct ones (room-deletion notices), newest first. */
export async function getNotificationFeed(userId: string, take = 50): Promise<Notification[]> {
  const memberships = await prisma.roomMember.findMany({
    where: { userId },
    select: { roomId: true, notificationsReadAt: true, joinedAt: true },
  });
  const roomIds = memberships.map((m) => m.roomId);
  const cutoffByRoomId = new Map(memberships.map((m) => [m.roomId, { notificationsReadAt: m.notificationsReadAt, joinedAt: m.joinedAt }]));

  const rows = await prisma.notification.findMany({
    where: { OR: [{ roomId: { in: roomIds } }, { recipientId: userId }] },
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take,
  });

  return rows.map((row: NotificationWithActor) => serializeNotification(row, cutoffByRoomId));
}

/** Unread counts for the sidebar: a dot per oversized-in-notifications room icon, plus a total for
 * the SQ button badge. Computed per-membership rather than a single grouped query, since each
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
        unreadCount: await prisma.notification.count({
          where: { roomId: m.roomId, createdAt: { gt: m.notificationsReadAt ?? m.joinedAt } },
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
