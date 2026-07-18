import type { Prisma } from '@prisma/client';
import type { Game, GamePrice, PriceRegion, VoteValue } from '@queueup/shared';
import { getSteamPrice, getSteamPrices } from './priceService.js';
import { checkPriceDropAlert, checkAllTimeLowAlert } from './priceAlerts.js';
import { getOwnershipInfo, type GameOwnershipInfo } from './gameOwnership.js';
import { toUserDto } from '../util/dto.js';

const gameWithRelations = {
  include: {
    adder: true,
    votes: { include: { user: true } },
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

const DEFAULT_OWNERSHIP: GameOwnershipInfo = { youOwn: false, ownership: null };

function buildGameDto(game: GameWithRelations, currentUserId: string, price: GamePrice, ownership: GameOwnershipInfo): Game {
  const myVote = game.votes.find((v) => v.userId === currentUserId);
  const voteScore = game.votes.reduce((sum, v) => sum + v.value, 0);

  return {
    id: game.id,
    roomId: game.roomId,
    addedBy: toUserDto(game.adder),
    title: game.title,
    platform: game.platform,
    genre: game.genre,
    releaseYear: game.releaseYear,
    maxCoopPlayers: game.maxCoopPlayers,
    timeToBeatHours: game.timeToBeatHours,
    ggDealsUrl: game.ggDealsUrl,
    coverImageUrl: game.coverImageUrl,
    status: game.status,
    price,
    targetPrice: game.targetPrice,
    votes: game.votes.map((v) => ({ user: toUserDto(v.user), value: v.value as VoteValue, createdAt: v.createdAt.toISOString() })),
    myVote: (myVote?.value as VoteValue | undefined) ?? null,
    voteScore,
    youOwn: ownership.youOwn,
    ownership: ownership.ownership,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

export async function serializeGame(game: GameWithRelations, currentUserId: string, region?: PriceRegion): Promise<Game> {
  const price = game.steamAppid ? await getSteamPrice(game.steamAppid, { region }) : UNAVAILABLE_PRICE;
  // Not awaited: this piggybacks on whatever page load happened to trigger a fresh price fetch
  // (see priceAlerts.ts) rather than gating the response on it - a delayed alert is fine, a
  // slower shelf/room load for every viewer isn't.
  if (game.targetPrice) void checkPriceDropAlert(game, price);
  void checkAllTimeLowAlert(game, price);
  const ownershipMap = await getOwnershipInfo([game], currentUserId);
  return buildGameDto(game, currentUserId, price, ownershipMap.get(game.id) ?? DEFAULT_OWNERSHIP);
}

export async function serializeGames(games: GameWithRelations[], currentUserId: string, region?: PriceRegion): Promise<Game[]> {
  const steamAppIds = games.map((g) => g.steamAppid).filter((id): id is number => id != null);
  const [prices, ownershipMap] = await Promise.all([getSteamPrices(steamAppIds, { region }), getOwnershipInfo(games, currentUserId)]);

  return games.map((game) => {
    const price = (game.steamAppid && prices.get(game.steamAppid)) || UNAVAILABLE_PRICE;
    if (game.targetPrice) void checkPriceDropAlert(game, price);
    void checkAllTimeLowAlert(game, price);
    return buildGameDto(game, currentUserId, price, ownershipMap.get(game.id) ?? DEFAULT_OWNERSHIP);
  });
}
