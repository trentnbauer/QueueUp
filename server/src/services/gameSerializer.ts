import type { Prisma } from '@prisma/client';
import type { Game, GamePrice, PriceRegion, RoomPlatform, VoteValue } from '@queueup/shared';
import { getSteamPrice, getSteamPrices } from './priceService.js';
import { runPriceAlertChecks } from './priceAlerts.js';
import { getOwnershipInfo, type GameOwnershipInfo } from './gameOwnership.js';
import { getRoomPlatform, getRoomPlatforms } from './roomAccess.js';
import { toUserDto } from '../util/dto.js';

const gameWithRelations = {
  include: {
    adder: true,
    votes: { include: { user: true } },
    // Every tag applied by anyone (in practice, only ever the adder - see requireGameTagAccess) -
    // filtered down to the current viewer's own tags in buildGameDto below, not here, since this
    // shared `include` isn't scoped to a particular viewer.
    tags: { include: { tag: true } },
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

const DEFAULT_OWNERSHIP: GameOwnershipInfo = { youOwn: false, ownership: null, wishlist: null, ownedPlatforms: [] };

function buildGameDto(
  game: GameWithRelations,
  currentUserId: string,
  price: GamePrice,
  ggDealsUrl: string | null,
  ownership: GameOwnershipInfo,
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
    platform: game.platform,
    genre: game.genre,
    releaseYear: game.releaseYear,
    releaseDate: game.releaseDate ? game.releaseDate.toISOString() : null,
    maxCoopPlayers: game.maxCoopPlayers,
    timeToBeatHours: game.timeToBeatHours,
    timeToBeatRushedHours: game.timeToBeatRushedHours,
    timeToBeatCompletionistHours: game.timeToBeatCompletionistHours,
    ggDealsUrl,
    coverImageUrl: game.coverImageUrl,
    status: game.status,
    steamFullyCompleted: game.steamFullyCompleted,
    price,
    targetPrice: game.targetPrice,
    manualPrice: game.manualPrice,
    votes: game.votes.map((v) => ({ user: toUserDto(v.user), value: v.value as VoteValue, createdAt: v.createdAt.toISOString() })),
    myVote: (myVote?.value as VoteValue | undefined) ?? null,
    voteScore,
    youOwn: ownership.youOwn,
    ownership: ownership.ownership,
    wishlist: ownership.wishlist,
    ownedPlatforms: ownership.ownedPlatforms,
    tags,
    igdbCollectionId: game.igdbCollectionId,
    reviewScore: game.reviewScore,
    prerequisiteGameId: game.prerequisiteGameId,
    baseGameId: game.baseGameId,
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
  // Not awaited: this piggybacks on whatever page load happened to trigger a fresh price fetch
  // (see priceAlerts.ts) rather than gating the response on it - a delayed alert is fine, a
  // slower shelf/room load for every viewer isn't. Also covered independently of page views by
  // the scheduled job (jobs/priceAlertJob.ts, #255) - this call stays so a drop is still caught
  // immediately when a live fetch happens to occur anyway, rather than waiting for the next run.
  void runPriceAlertChecks(game, price);
  const ownershipMap = await getOwnershipInfo([game], currentUserId);
  return buildGameDto(game, currentUserId, price, ggDealsUrl, ownershipMap.get(game.id) ?? DEFAULT_OWNERSHIP);
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
  const [prices, ownershipMap] = await Promise.all([getSteamPrices(pcSteamAppIds, { region }), getOwnershipInfo(games, currentUserId)]);

  return games.map((game) => {
    const platform = platformFor(game);
    const price = (platform === 'pc' && game.steamAppid && prices.get(game.steamAppid)) || UNAVAILABLE_PRICE;
    const ggDealsUrl = platform === 'pc' ? game.ggDealsUrl : null;
    void runPriceAlertChecks(game, price);
    return buildGameDto(game, currentUserId, price, ggDealsUrl, ownershipMap.get(game.id) ?? DEFAULT_OWNERSHIP);
  });
}
