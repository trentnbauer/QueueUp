import type { BadgeDefinition, RoomPlatform } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { unlockBadges } from './badges.js';
import type { GameWithRelations } from './gameSerializer.js';

/** Replaces a user's full set of owned platforms for one igdbId - see the GameOwnership model doc
 * for why this is keyed by igdbId, not a specific Game row. An empty list deletes the claim
 * entirely (the user owns it nowhere), rather than leaving a row with an empty platforms array
 * on file - that empty-array shape is reserved for pre-migration rows whose platform was never
 * recorded (see the model doc), not a fresh "explicitly owns nothing" state. Returns any newly-
 * unlocked badge (issue #489, "buy a game" - there's no real purchase/checkout concept in this
 * app, so marking ownership is the closest fit) - only on the add path, never on the delete/clear
 * branch, since un-marking ownership isn't the action the badge is celebrating. */
export async function setOwnershipPlatforms(userId: string, igdbId: number, platforms: RoomPlatform[]): Promise<BadgeDefinition | null> {
  const deduped = Array.from(new Set(platforms));
  if (deduped.length === 0) {
    await prisma.gameOwnership.deleteMany({ where: { userId, igdbId } });
    return null;
  }
  await prisma.gameOwnership.upsert({
    where: { userId_igdbId: { userId, igdbId } },
    create: { userId, igdbId, platforms: deduped },
    update: { platforms: deduped },
  });
  return (await unlockBadges(userId, ['first_ownership_marked']))[0] ?? null;
}

/** Adds or removes exactly one platform from whatever a user's existing claim already covers,
 * leaving any other platform they've claimed untouched - used by a room's single "mark as owned"
 * toggle, which only ever means "I own this on this room's platform" (the route infers `platform`
 * from the room the game is in). A pre-migration claim with no platform recorded (see the model
 * doc) has nothing specific to remove on un-mark, so that case clears the claim entirely instead -
 * the user is explicitly saying "I don't own this," not "I don't own the platform I never told you
 * about." */
export async function toggleOwnershipForPlatform(
  userId: string,
  igdbId: number,
  platform: RoomPlatform,
  owned: boolean,
): Promise<BadgeDefinition | null> {
  const existing = await prisma.gameOwnership.findUnique({ where: { userId_igdbId: { userId, igdbId } } });
  if (owned) {
    return setOwnershipPlatforms(userId, igdbId, [...(existing?.platforms ?? []), platform]);
  }
  const platforms = existing && existing.platforms.length > 0 ? existing.platforms.filter((p) => p !== platform) : [];
  return setOwnershipPlatforms(userId, igdbId, platforms);
}

/** Adds platforms to whatever a user's existing claim already covers, without removing any
 * platform already recorded - used by a Playnite library sync (unlike setOwnershipPlatforms' full
 * replace), since a sync may run repeatedly and each run only reports whichever platforms Playnite
 * currently sees, not the full history of every platform ever synced. Re-syncing a title that's no
 * longer installed on some platform shouldn't silently un-claim it. */
export async function unionOwnershipPlatforms(userId: string, igdbId: number, platforms: RoomPlatform[]): Promise<BadgeDefinition | null> {
  if (platforms.length === 0) return null;
  const existing = await prisma.gameOwnership.findUnique({ where: { userId_igdbId: { userId, igdbId } } });
  return setOwnershipPlatforms(userId, igdbId, [...(existing?.platforms ?? []), ...platforms]);
}

/** Bulk-marks igdbIds as owned on PC - used by the Steam library import, since a successful
 * import IS an ownership claim (issue #176), and Steam ownership only ever implies PC. Existing
 * claims are left alone (skipDuplicates) - a re-import doesn't merge in `pc` alongside whatever
 * platforms a claim already lists, same as before this platform-scoping existed. Returns any
 * newly-unlocked first_ownership_marked badge (issue #489), same as setOwnershipPlatforms - this
 * is the one ownership-writing path that doesn't go through it (a raw createMany, not an
 * upsert-by-igdbId, since it's meant to run over a whole library at once). */
export async function markOwned(userId: string, igdbIds: number[]): Promise<BadgeDefinition | null> {
  if (igdbIds.length === 0) return null;
  await prisma.gameOwnership.createMany({
    data: igdbIds.map((igdbId) => ({ userId, igdbId, platforms: ['pc' as RoomPlatform] })),
    skipDuplicates: true,
  });
  return (await unlockBadges(userId, ['first_ownership_marked']))[0] ?? null;
}

/** Used by priceAlerts.ts to skip notifying about a game its owner already owns (issue #187) -
 * there's no "should I buy this" decision left to inform once you already have it. Checked
 * against the game's owner (addedBy), not whoever's currently viewing it, since a room game can
 * be viewed by members other than the person the alert notifies. `platform` should be the game's
 * room's platform when it's a room game, or null for a Personal Shelf game (no single platform to
 * compare against there) - null also degrades to "owns any platform," same as an empty/legacy
 * claim, so a Personal Shelf price alert isn't affected by this platform-scoping at all. */
export async function isOwnedBy(userId: string, igdbId: number, platform: RoomPlatform | null): Promise<boolean> {
  const row = await prisma.gameOwnership.findUnique({ where: { userId_igdbId: { userId, igdbId } } });
  if (!row) return false;
  if (platform === null || row.platforms.length === 0) return true;
  return row.platforms.includes(platform);
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
  /** Which platform(s) the current viewer's own GameOwnership claim covers for this igdbId
   * (issue #456 - "what system do I own this on") - Personal Shelf only, always [] for a room
   * game (a room's own single Room.platform already answers that there, so there's nothing extra
   * to show). Also [] when not owned, or when owned but the claim predates platform tracking (see
   * the GameOwnership model doc) - the UI treats all of those the same way: no system badge. */
  ownedPlatforms: RoomPlatform[];
}

/** Batched ownership lookup for a list of games (avoids N+1 - one query for ownership rows, one
 * for room memberships/platforms, regardless of how many games are being serialized). Ownership
 * is a fact about (user, igdbId, platform) - a room game only counts a claim toward "owned" when
 * the room's own platform is among the claiming user's platforms (or their claim predates platform
 * tracking - see the GameOwnership model doc), so owning a title on one platform doesn't silently
 * mark it owned in a room for a different one. On the Personal Shelf there's no single strict
 * platform to compare against (Game.platform there is a free-text IGDB/Steam label, not a
 * RoomPlatform), so `youOwn` there stays a simple "is there any claim at all" - EXCEPT that a
 * Personal Shelf entry's own `status` is a first-person claim from that same viewer ("wishlist"
 * means *this exact person* is saying "I don't have this yet" - see the GameStatus enum doc), so
 * it overrides a stale/cross-context GameOwnership row (issue #419): re-adding a title after
 * removing an owned copy, marking a *room* copy owned on some platform, or any other path that
 * writes a claim for the same igdbId shouldn't make an explicit "I want this" wishlist entry
 * contradict itself by also showing "Owned". A room game's `youOwn` isn't gated the same way -
 * there, `status` describes the room's shared copy, not a personal claim from whoever's currently
 * looking at it, so it says nothing about whether *this viewer* owns the title. `ownership`/
 * `wishlist` stay null on the Personal Shelf - there's no group to count there either. */
export async function getOwnershipInfo(games: GameWithRelations[], currentUserId: string): Promise<Map<string, GameOwnershipInfo>> {
  const result = new Map<string, GameOwnershipInfo>();
  if (games.length === 0) return result;

  const igdbIds = [...new Set(games.map((g) => g.igdbId))];
  const roomIds = [...new Set(games.map((g) => g.roomId).filter((id): id is string => id != null))];

  const [ownershipRows, roomMemberRows, rooms, wishlistRows] = await Promise.all([
    prisma.gameOwnership.findMany({ where: { igdbId: { in: igdbIds } }, select: { igdbId: true, userId: true, platforms: true } }),
    roomIds.length > 0
      ? prisma.roomMember.findMany({ where: { roomId: { in: roomIds } }, select: { roomId: true, userId: true } })
      : Promise.resolve([] as { roomId: string; userId: string }[]),
    roomIds.length > 0
      ? prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, platform: true } })
      : Promise.resolve([] as { id: string; platform: RoomPlatform }[]),
    // Personal-shelf rows only (roomId null) - a room member's *want* for a game lives on their own
    // shelf, not the shared room row (which has one status for the whole room, not per-member).
    prisma.game.findMany({
      where: { roomId: null, igdbId: { in: igdbIds }, status: 'wishlist' },
      select: { igdbId: true, addedBy: true },
    }),
  ]);

  const ownershipByIgdbId = new Map<number, Map<string, RoomPlatform[]>>();
  for (const row of ownershipRows) {
    if (!ownershipByIgdbId.has(row.igdbId)) ownershipByIgdbId.set(row.igdbId, new Map());
    ownershipByIgdbId.get(row.igdbId)!.set(row.userId, row.platforms);
  }

  // A claim with no platforms recorded predates platform tracking (see the model doc) and still
  // counts as owned everywhere; otherwise it only counts for a room whose own platform it lists.
  function ownsOnPlatform(igdbId: number, userId: string, platform: RoomPlatform): boolean {
    const platforms = ownershipByIgdbId.get(igdbId)?.get(userId);
    if (platforms === undefined) return false;
    return platforms.length === 0 || platforms.includes(platform);
  }

  const platformByRoomId = new Map(rooms.map((r) => [r.id, r.platform]));

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
    if (game.roomId) {
      const roomPlatform = platformByRoomId.get(game.roomId);
      const memberIds = membersByRoom.get(game.roomId) ?? [];
      // roomPlatform should always be found (every roomId here came from one of these games) -
      // the fallback just avoids a non-null assertion if a room was deleted out from under this.
      const youOwn = roomPlatform ? ownsOnPlatform(game.igdbId, currentUserId, roomPlatform) : false;
      const owned = roomPlatform ? memberIds.filter((id) => ownsOnPlatform(game.igdbId, id, roomPlatform)).length : 0;
      const wishlisters = wishlistersByIgdbId.get(game.igdbId) ?? new Set<string>();
      const wishlisted = memberIds.filter((id) => wishlisters.has(id)).length;
      result.set(game.id, {
        youOwn,
        ownership: { owned, total: memberIds.length },
        wishlist: { wishlisted, total: memberIds.length },
        ownedPlatforms: [],
      });
    } else {
      const youOwn = game.status !== 'wishlist' && (ownershipByIgdbId.get(game.igdbId)?.has(currentUserId) ?? false);
      const ownedPlatforms = youOwn ? (ownershipByIgdbId.get(game.igdbId)?.get(currentUserId) ?? []) : [];
      result.set(game.id, { youOwn, ownership: null, wishlist: null, ownedPlatforms });
    }
  }

  return result;
}
