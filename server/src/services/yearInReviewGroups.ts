import type { YearInReviewGroupCompletion } from '@queueup/shared';

/** The completed games of a Year in Review, bucketed by the room they were in (Personal Shelf games in one bucket with no room). Who else is in a room is only
 * named for a room the person is in now: someone who has left, or been removed from, a room still has the games they added there, and must not be handed its
 * member list by their recap. `members` are the room's current members (anyone, from any room); `memberRoomIds` the rooms the person is in now. */
export function groupCompleted(
  done: { id: string; title: string; roomId: string | null }[],
  userId: string,
  roomNames: Map<string, string>,
  members: { roomId: string; userId: string; displayName: string }[],
  memberRoomIds: ReadonlySet<string>,
): YearInReviewGroupCompletion[] {
  const namesByRoom = new Map<string, string[]>();
  for (const m of members) {
    if (m.userId === userId || !memberRoomIds.has(m.roomId)) continue;
    const names = namesByRoom.get(m.roomId) ?? [];
    names.push(m.displayName);
    namesByRoom.set(m.roomId, names);
  }
  const groups = new Map<string, { roomId: string | null; games: { id: string; title: string }[] }>();
  for (const g of done) {
    const key = g.roomId ?? '';
    const existing = groups.get(key);
    if (existing) existing.games.push({ id: g.id, title: g.title });
    else groups.set(key, { roomId: g.roomId, games: [{ id: g.id, title: g.title }] });
  }
  return [...groups.values()].map((group) => ({
    roomId: group.roomId,
    roomName: group.roomId != null ? (roomNames.get(group.roomId) ?? null) : null,
    memberNames: group.roomId != null ? (namesByRoom.get(group.roomId) ?? []) : [],
    games: group.games,
  }));
}
