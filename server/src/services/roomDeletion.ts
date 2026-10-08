import { Prisma, type Room, type RoomRole } from '@prisma/client';
import type { DeletedRoomSummary } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';

/** How long a deleted room can be restored before the daily purge removes it for good (#1103). */
export const ROOM_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** One member as they were when the room was deleted, kept on Room.deletedMembers. */
export interface DeletedMember {
  userId: string;
  role: RoomRole;
  joinedAt: string;
  notificationsReadAt: string | null;
}

/** When a room deleted at `deletedAt` is removed for good. */
export const purgeDateFor = (deletedAt: Date): Date => new Date(deletedAt.getTime() + ROOM_RETENTION_DAYS * DAY_MS);

/** Reads Room.deletedMembers, skipping anything that isn't a well-formed entry. */
export function parseDeletedMembers(value: Prisma.JsonValue | null | undefined): DeletedMember[] {
  if (!Array.isArray(value)) return [];
  const roles: RoomRole[] = ['room_master', 'moderator', 'member'];
  return value.flatMap((v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
    const { userId, role, joinedAt, notificationsReadAt } = v as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof joinedAt !== 'string' || !roles.includes(role as RoomRole)) return [];
    return [{ userId, role: role as RoomRole, joinedAt, notificationsReadAt: typeof notificationsReadAt === 'string' ? notificationsReadAt : null }];
  });
}

/** Whether this person was the room's Room Master when it was deleted - the one who can restore it
 * (besides an administrator). */
export function wasRoomMaster(deletedMembers: Prisma.JsonValue | null | undefined, userId: string): boolean {
  return parseDeletedMembers(deletedMembers).some((m) => m.userId === userId && m.role === 'room_master');
}

/** The members to put back on restore: those whose accounts still exist, with a Room Master among
 * them - the earliest to join is promoted when the old one is gone. Pure, for testing. */
export function membersToRestore(snapshot: DeletedMember[], existingUserIds: Set<string>): DeletedMember[] {
  const kept = snapshot.filter((m) => existingUserIds.has(m.userId)).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  if (kept.length && !kept.some((m) => m.role === 'room_master')) kept[0] = { ...kept[0], role: 'room_master' };
  return kept;
}

/** Deletes a room so it can be restored for ROOM_RETENTION_DAYS: stamps it deleted and moves its
 * members onto the room, which hides it from everyone. Returns what the caller needs to tell
 * people and log it, or null when there is no such (undeleted) room. */
export async function softDeleteRoom(roomId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findFirst({
      where: { id: roomId, deletedAt: null },
      include: { members: true, _count: { select: { games: true } } },
    });
    if (!room) return null;
    const snapshot: DeletedMember[] = room.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      notificationsReadAt: m.notificationsReadAt?.toISOString() ?? null,
    }));
    const deletedAt = new Date();
    await tx.room.update({ where: { id: roomId }, data: { deletedAt, deletedById: actorId, deletedMembers: snapshot as unknown as Prisma.InputJsonValue } });
    await tx.roomMember.deleteMany({ where: { roomId } });
    return { name: room.name, memberIds: snapshot.map((m) => m.userId), memberCount: snapshot.length, gameCount: room._count.games, deletedAt };
  });
}

/** Brings a deleted room back with its members, roles, games and history. */
export async function restoreRoom(roomId: string) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room || !room.deletedAt) throw new HttpError(404, 'There is no deleted room to restore');
    const snapshot = parseDeletedMembers(room.deletedMembers);
    const existing = await tx.user.findMany({ where: { id: { in: snapshot.map((m) => m.userId) } }, select: { id: true } });
    const members = membersToRestore(snapshot, new Set(existing.map((u) => u.id)));
    if (!members.length) throw new HttpError(409, 'None of the people in this room still have an account, so it cannot be restored');
    await tx.roomMember.createMany({
      data: members.map((m) => ({
        roomId,
        userId: m.userId,
        role: m.role,
        joinedAt: new Date(m.joinedAt),
        notificationsReadAt: m.notificationsReadAt ? new Date(m.notificationsReadAt) : null,
      })),
      skipDuplicates: true,
    });
    const restored = await tx.room.update({ where: { id: roomId }, data: { deletedAt: null, deletedById: null, deletedMembers: Prisma.DbNull } });
    return { room: restored, memberIds: members.map((m) => m.userId), masterId: members.find((m) => m.role === 'room_master')?.userId ?? null };
  });
}

/** Deleted rooms still inside the recovery window, newest first. */
export async function recentlyDeletedRooms(now: Date = new Date()) {
  return prisma.room.findMany({
    where: { deletedAt: { not: null, gt: new Date(now.getTime() - ROOM_RETENTION_DAYS * DAY_MS) } },
    include: { _count: { select: { games: true } } },
    orderBy: { deletedAt: 'desc' },
  });
}

/** Permanently removes rooms deleted more than ROOM_RETENTION_DAYS ago (the database cascade takes
 * their games and history with them). */
export async function purgeExpiredRooms(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.room.deleteMany({ where: { deletedAt: { lt: new Date(now.getTime() - ROOM_RETENTION_DAYS * DAY_MS) } } });
  return count;
}

/** Permanently removes the deleted rooms a person created, before their account is deleted:
 * Room.createdBy can't point at a missing account, and they chose to delete those rooms. */
export async function purgeDeletedRoomsCreatedBy(userId: string): Promise<number> {
  const { count } = await prisma.room.deleteMany({ where: { createdBy: userId, deletedAt: { not: null } } });
  return count;
}

/** What the "Recently deleted rooms" lists show about one room. */
export function toDeletedRoomSummary(r: Room & { _count: { games: number } }): DeletedRoomSummary {
  const deletedAt = r.deletedAt ?? new Date();
  return {
    id: r.id,
    name: r.name,
    accentColor: r.accentColor,
    platform: r.platform,
    memberCount: parseDeletedMembers(r.deletedMembers).length,
    gameCount: r._count.games,
    deletedAt: deletedAt.toISOString(),
    purgeAt: purgeDateFor(deletedAt).toISOString(),
  };
}
