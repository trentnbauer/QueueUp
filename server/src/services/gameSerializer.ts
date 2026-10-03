import type { Prisma } from '@prisma/client';
import { sortPlatformLabel, type Game, type GamePrice, type GameReview, type PriceRegion, type RoomPlatform, type SyncSource, type VoteValue } from '@queueup/shared';
import { getSteamPrice, getSteamPrices } from './priceService.js';
import { getOwnershipInfo, type GameOwnershipInfo } from './gameOwnership.js';
import { getRoomPlatform, getRoomPlatforms } from './roomAccess.js';
import { getPlaytimeSinceCheckpoint, type GamePlaytimeInfo } from './playtimeTracking.js';
import { getAchievementProgressMap, getRoomMemberAchievementMap, type AchievementCount, type MemberAchievementCount } from './achievementProgress.js';
import { getRemovalInfo, type RemovalInfo } from './removalVote.js';
import { getSyncSources } from './syncSources.js';
import { toUserDto } from '../util/dto.js';

const gameWithRelations = {
  include: {
    adder: true,
    votes: { include: { user: true } },
    // Every tag applied by anyone (in practice, only ever the adder - see requireGameTagAccess) -
    // filtered down to the current viewer's own tags in buildGameDto below, not here, since this
    // shared `include` isn't scoped to a particular viewer.
    tags: { include: { tag: true } },
    // Everyone's reviews of this game (a room game has at most one per member); buildGameDto
    // picks out the viewer's own.
    reviews: true,
    // Who has voted to remove it; tallied against the room's current members in getRemovalInfo.
    removalVotes: { select: { userId: true } },
  },
} satisfies Prisma.GameDefaultArgs;

export type GameWithRelations = Prisma.GameGetPayload<typeof gameWithRelations>;
export const gameInclude = gameWithRelations.include;

const UNAVAILABLE_PRICE: GamePrice = {
  amount: null,
  currency: null,
  source: 'unavailable',
  historicalLow: null,
  lastRefreshedAt: null,
};

const DEFAULT_OWNERSHIP: GameOwnershipInfo = { youOwn: false, ownership: null, ownerIds: [], wishlist: null, wishlisterIds: [], ownedPlatforms: [] };

/** One person's GameReview row as a DTO - null when they haven't reviewed the game. */
export function toGameReviewDto(
  review: {
    art: number | null;
    gameplay: number | null;
    story: number | null;
    sound: number | null;
    note: string | null;
    reviewedAt: Date;
  } | null | undefined,
): GameReview | null {
  if (!review) return null;
  return {
    art: review.art,
    gameplay: review.gameplay,
    story: review.story,
    sound: review.sound,
    note: review.note,
    reviewedAt: review.reviewedAt.toISOString(),
  };
}

/** The gg.deals link comes from a third-party API response and the client opens it directly, so only
 * a plain http(s) URL is passed through - never a javascript: or data: one. */
function safeExternalUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function buildGameDto(
  game: GameWithRelations,
  currentUserId: string,
  price: GamePrice,
  ggDealsUrl: string | null,
  ownership: GameOwnershipInfo,
  playtime: GamePlaytimeInfo | undefined,
  achievements: AchievementCount | undefined,
  memberAchievements: MemberAchievementCount[] | undefined,
  removal: RemovalInfo | undefined,
  syncSources: SyncSource[],
): Game {
  const myVote = game.votes.find((v) => v.userId === currentUserId);
  const voteScore = game.votes.reduce((sum, v) => sum + v.value, 0);
  // Filtered to the viewer's own tags (see the `tags` include's comment above) rather than every
  // GameTag row on this game - in practice these coincide (only the adder can tag a game, per
  // requireGameTagAccess), but filtering here keeps that invariant enforced at the read path too
  // instead of relying solely on the write path never being violated.
  const tags = game.tags
    .filter((gt) => gt.tag.userId === currentUserId)
    .map((gt) => ({ id: gt.tag.id, name: gt.tag.name, createdAt: gt.tag.createdAt.toISOString() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: game.id,
    roomId: game.roomId,
    addedBy: toUserDto(game.adder),
    title: game.title,
    platform: sortPlatformLabel(game.platform),
    genre: game.genre,
    releaseYear: game.releaseYear,
    releaseDate: game.releaseDate ? game.releaseDate.toISOString() : null,
    maxCoopPlayers: game.maxCoopPlayers,
    timeToBeatHours: game.timeToBeatHours,
    timeToBeatRushedHours: game.timeToBeatRushedHours,
    timeToBeatCompletionistHours: game.timeToBeatCompletionistHours,
    ggDealsUrl: safeExternalUrl(ggDealsUrl),
    coverImageUrl: game.coverImageUrl,
    status: game.status,
    steamFullyCompleted: game.steamFullyCompleted,
    myAchievements: achievements ?? null,
    memberAchievements: memberAchievements ?? [],
    price,
    targetPrice: game.targetPrice,
    manualPrice: game.manualPrice,
    votes: game.votes.map((v) => ({ user: toUserDto(v.user), value: v.value as VoteValue, createdAt: v.createdAt.toISOString() })),
    myVote: (myVote?.value as VoteValue | undefined) ?? null,
    voteScore,
    youOwn: ownership.youOwn,
    ownership: ownership.ownership,
    ownerIds: ownership.ownerIds,
    wishlist: ownership.wishlist,
    wishlisterIds: ownership.wishlisterIds,
    ownedPlatforms: ownership.ownedPlatforms,
    tags,
    igdbCollectionId: game.igdbCollectionId,
    reviewScore: game.reviewScore,
    prerequisiteGameId: game.prerequisiteGameId,
    baseGameId: game.baseGameId,
    playtimeSinceCheckpointMinutes: playtime?.sinceCheckpointMinutes ?? null,
    currentPlaytimeMinutes: playtime?.currentMinutes ?? null,
    replayedAt: game.replayedAt ? game.replayedAt.toISOString() : null,
    hiddenFromOthers: game.hiddenFromOthers,
    removeVotes: removal?.votes ?? 0,
    removeVotesNeeded: removal?.needed ?? 0,
    youVotedRemove: game.removalVotes.some((v) => v.userId === currentUserId),
    syncSources,
    sensitiveContent: game.sensitiveContent,
    review: toGameReviewDto(game.reviews.find((r) => r.userId === currentUserId)),
    releaseAlert: game.releaseAlert,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

/** gg.deals (our only price source) is Steam-App-ID-based, i.e. PC-only - a room on any other
 * platform gets GamePrice's 'unavailable' state (and no buy link) rather than the Personal Shelf/
 * PC price for the same title, which would otherwise be misleading (issue: platform-scoped
 * pricing - the Switch-vs-PC-room case). Personal Shelf games (roomId null) aren't scoped to a
 * single strict platform (Game.platform there is a free-text IGDB label, not a RoomPlatform - same
 * reasoning as youOwn in gameOwnership.ts), so pricing there is unaffected by this gating. A
 * platform-less room (issue #473) is treated the same way - null isn't evidence the game is
 * non-PC, just that this room never restricted it, so it falls back to 'pc' rather than hiding
 * pricing for everything in the room. */
async function resolvePricingPlatform(game: GameWithRelations): Promise<RoomPlatform> {
  return game.roomId ? ((await getRoomPlatform(game.roomId)) ?? 'pc') : 'pc';
}

export async function serializeGame(game: GameWithRelations, currentUserId: string, region?: PriceRegion): Promise<Game> {
  const platform = await resolvePricingPlatform(game);
  const price = platform === 'pc' && game.steamAppid ? await getSteamPrice(game.steamAppid, { region }) : UNAVAILABLE_PRICE;
  const ggDealsUrl = platform === 'pc' ? game.ggDealsUrl : null;
  const [ownershipMap, playtimeMap, achievementMap, memberAchievementMap, removalMap, syncMap] = await Promise.all([
    getOwnershipInfo([game], currentUserId),
    getPlaytimeSinceCheckpoint([game]),
    getAchievementProgressMap(currentUserId, [game.igdbId]),
    getRoomMemberAchievementMap([game], currentUserId),
    getRemovalInfo([game]),
    getSyncSources([game], currentUserId),
  ]);
  return buildGameDto(
    game,
    currentUserId,
    price,
    ggDealsUrl,
    ownershipMap.get(game.id) ?? DEFAULT_OWNERSHIP,
    playtimeMap.get(game.id),
    achievementMap.get(game.igdbId),
    memberAchievementMap.get(game.id),
    removalMap.get(game.id),
    syncMap.get(game.id) ?? [],
  );
}

export async function serializeGames(games: GameWithRelations[], currentUserId: string, region?: PriceRegion): Promise<Game[]> {
  const roomIds = games.map((g) => g.roomId).filter((id): id is string => id != null);
  const roomPlatforms = await getRoomPlatforms(roomIds);
  // Missing from roomPlatforms entirely (e.g. the room was deleted between the games fetch and
  // this batch lookup) fails *closed* on purpose - undefined, not 'pc', so no price/buy-link is
  // shown for a room whose actual platform is now unknown (matches priceAlertJob.ts's isPcGame).
  // Present but null (issue #473's platform-less room) is different - not a lost room, just one
  // that was never restricted - so that case falls back to 'pc', same as resolvePricingPlatform
  // above and the Personal Shelf.
  const platformFor = (game: GameWithRelations): RoomPlatform | undefined => {
    if (!game.roomId) return 'pc';
    const roomPlatform = roomPlatforms.get(game.roomId);
    return roomPlatform === undefined ? undefined : (roomPlatform ?? 'pc');
  };

  // Only a `pc`-platform game's steamAppId is worth a real price fetch - everything else gets
  // 'unavailable' directly below, no gg.deals call at all (see resolvePricingPlatform).
  const pcSteamAppIds = games
    .filter((g) => platformFor(g) === 'pc')
    .map((g) => g.steamAppid)
    .filter((id): id is number => id != null);
  const [prices, ownershipMap, playtimeMap, achievementMap, memberAchievementMap, removalMap, syncMap] = await Promise.all([
    getSteamPrices(pcSteamAppIds, { region }),
    getOwnershipInfo(games, currentUserId),
    getPlaytimeSinceCheckpoint(games),
    getAchievementProgressMap(currentUserId, games.map((g) => g.igdbId)),
    getRoomMemberAchievementMap(games, currentUserId),
    getRemovalInfo(games),
    getSyncSources(games, currentUserId),
  ]);

  return games.map((game) => {
    const platform = platformFor(game);
    const price = (platform === 'pc' && game.steamAppid && prices.get(game.steamAppid)) || UNAVAILABLE_PRICE;
    const ggDealsUrl = platform === 'pc' ? game.ggDealsUrl : null;
    return buildGameDto(
      game,
      currentUserId,
      price,
      ggDealsUrl,
      ownershipMap.get(game.id) ?? DEFAULT_OWNERSHIP,
      playtimeMap.get(game.id),
      achievementMap.get(game.igdbId),
      memberAchievementMap.get(game.id),
      removalMap.get(game.id),
      syncMap.get(game.id) ?? [],
    );
  });
}
