import { prisma } from '../db/client.js';

/** Votes needed to remove a room game: more than half of the room's members. */
export function removalVotesNeeded(memberCount: number): number {
  return Math.floor(memberCount / 2) + 1;
}

export interface RemovalInfo {
  votes: number;
  needed: number;
}

/** Remove-vote tallies for a batch of games. Only votes from people still in the room count, so a
 * member who left can't tip a game over. Personal Shelf games (no room) get 0/0. */
export async function getRemovalInfo(
  games: { id: string; roomId: string | null; removalVotes: { userId: string }[] }[],
): Promise<Map<string, RemovalInfo>> {
  const roomIds = [...new Set(games.map((g) => g.roomId).filter((id): id is string => id != null))];
  const membersByRoom = new Map<string, Set<string>>();
  if (roomIds.length > 0) {
    const members = await prisma.roomMember.findMany({ where: { roomId: { in: roomIds } }, select: { roomId: true, userId: true } });
    for (const m of members) {
      const set = membersByRoom.get(m.roomId) ?? new Set<string>();
      set.add(m.userId);
      membersByRoom.set(m.roomId, set);
    }
  }
  const out = new Map<string, RemovalInfo>();
  for (const g of games) {
    const members = g.roomId ? membersByRoom.get(g.roomId) : undefined;
    if (!members) {
      out.set(g.id, { votes: 0, needed: 0 });
      continue;
    }
    out.set(g.id, { votes: g.removalVotes.filter((v) => members.has(v.userId)).length, needed: removalVotesNeeded(members.size) });
  }
  return out;
}
