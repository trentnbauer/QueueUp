import { prisma } from '../db/client.js';
import type { GameWithRelations } from './gameSerializer.js';

/** Marks (or clears) one user's ownership claim on a game, keyed by igdbId - see the
 * GameOwnership model doc for why this isn't tied to a specific Game row. */
export async function setOwnership(userId: string, igdbId: number, owned: boolean): Promise<void> {
  if (owned) {
    await prisma.gameOwnership.upsert({
      where: { userId_igdbId: { userId, igdbId } },
      create: { userId, igdbId },
      update: {},
    });
  } else {
    await prisma.gameOwnership.deleteMany({ where: { userId, igdbId } });
  }
}

/** Bulk-marks igdbIds as owned - used by the Steam library import, since a successful import IS
 * an ownership claim (issue #176). Existing claims are left alone (skipDuplicates). */
export async function markOwned(userId: string, igdbIds: number[]): Promise<void> {
  if (igdbIds.length === 0) return;
  await prisma.gameOwnership.createMany({
    data: igdbIds.map((igdbId) => ({ userId, igdbId })),
    skipDuplicates: true,
  });
}

export interface GameOwnershipInfo {
  youOwn: boolean;
  ownership: { owned: number; total: number } | null;
}

/** Batched ownership lookup for a list of games (avoids N+1 - one query for ownership rows, one
 * for room memberships, regardless of how many games are being serialized). Ownership is a fact
 * about (user, igdbId), so it's the same "youOwn" value everywhere that igdbId shows up; the
 * per-room "N of M own this" count is computed against each game's own room's *current* members
 * only. Personal Shelf games (roomId null) get `ownership: null` - there's no group to count. */
export async function getOwnershipInfo(games: GameWithRelations[], currentUserId: string): Promise<Map<string, GameOwnershipInfo>> {
  const result = new Map<string, GameOwnershipInfo>();
  if (games.length === 0) return result;

  const igdbIds = [...new Set(games.map((g) => g.igdbId))];
  const roomIds = [...new Set(games.map((g) => g.roomId).filter((id): id is string => id != null))];

  const [ownershipRows, roomMemberRows] = await Promise.all([
    prisma.gameOwnership.findMany({ where: { igdbId: { in: igdbIds } }, select: { igdbId: true, userId: true } }),
    roomIds.length > 0
      ? prisma.roomMember.findMany({ where: { roomId: { in: roomIds } }, select: { roomId: true, userId: true } })
      : Promise.resolve([] as { roomId: string; userId: string }[]),
  ]);

  const ownersByIgdbId = new Map<number, Set<string>>();
  for (const row of ownershipRows) {
    if (!ownersByIgdbId.has(row.igdbId)) ownersByIgdbId.set(row.igdbId, new Set());
    ownersByIgdbId.get(row.igdbId)!.add(row.userId);
  }

  const membersByRoom = new Map<string, string[]>();
  for (const m of roomMemberRows) {
    if (!membersByRoom.has(m.roomId)) membersByRoom.set(m.roomId, []);
    membersByRoom.get(m.roomId)!.push(m.userId);
  }

  for (const game of games) {
    const owners = ownersByIgdbId.get(game.igdbId) ?? new Set<string>();
    const youOwn = owners.has(currentUserId);
    if (game.roomId) {
      const memberIds = membersByRoom.get(game.roomId) ?? [];
      const owned = memberIds.filter((id) => owners.has(id)).length;
      result.set(game.id, { youOwn, ownership: { owned, total: memberIds.length } });
    } else {
      result.set(game.id, { youOwn, ownership: null });
    }
  }

  return result;
}
