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

/** Used by priceAlerts.ts to skip notifying about a game its owner already owns (issue #187) -
 * there's no "should I buy this" decision left to inform once you already have it. Checked
 * against the game's owner (addedBy), not whoever's currently viewing it, since a room game can
 * be viewed by members other than the person the alert notifies. */
export async function isOwnedBy(userId: string, igdbId: number): Promise<boolean> {
  const row = await prisma.gameOwnership.findUnique({ where: { userId_igdbId: { userId, igdbId } } });
  return row !== null;
}

export interface GameOwnershipInfo {
  youOwn: boolean;
  ownership: { owned: number; total: number } | null;
  /** How many of the room's *current* members also have this igdbId wishlisted on their own
   * Personal Shelf, out of how many current members there are (issue #368) - parallel to
   * `ownership` above, but sourced from each member's own personal-shelf Game row rather than a
   * dedicated table, since (unlike ownership) wishlisting has no cross-context claim of its own.
   * Null on the Personal Shelf, same as `ownership` - there's no group to count there either. */
  wishlist: { wishlisted: number; total: number } | null;
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

  const [ownershipRows, roomMemberRows, wishlistRows] = await Promise.all([
    prisma.gameOwnership.findMany({ where: { igdbId: { in: igdbIds } }, select: { igdbId: true, userId: true } }),
    roomIds.length > 0
      ? prisma.roomMember.findMany({ where: { roomId: { in: roomIds } }, select: { roomId: true, userId: true } })
      : Promise.resolve([] as { roomId: string; userId: string }[]),
    // Personal-shelf rows only (roomId null) - a room member's *want* for a game lives on their own
    // shelf, not the shared room row (which has one status for the whole room, not per-member).
    prisma.game.findMany({
      where: { roomId: null, igdbId: { in: igdbIds }, status: 'wishlist' },
      select: { igdbId: true, addedBy: true },
    }),
  ]);

  const ownersByIgdbId = new Map<number, Set<string>>();
  for (const row of ownershipRows) {
    if (!ownersByIgdbId.has(row.igdbId)) ownersByIgdbId.set(row.igdbId, new Set());
    ownersByIgdbId.get(row.igdbId)!.add(row.userId);
  }

  const wishlistersByIgdbId = new Map<number, Set<string>>();
  for (const row of wishlistRows) {
    if (!wishlistersByIgdbId.has(row.igdbId)) wishlistersByIgdbId.set(row.igdbId, new Set());
    wishlistersByIgdbId.get(row.igdbId)!.add(row.addedBy);
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
      const wishlisters = wishlistersByIgdbId.get(game.igdbId) ?? new Set<string>();
      const wishlisted = memberIds.filter((id) => wishlisters.has(id)).length;
      result.set(game.id, { youOwn, ownership: { owned, total: memberIds.length }, wishlist: { wishlisted, total: memberIds.length } });
    } else {
      result.set(game.id, { youOwn, ownership: null, wishlist: null });
    }
  }

  return result;
}
