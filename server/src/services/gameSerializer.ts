import type { Prisma } from '@prisma/client';
import type { Game, GamePrice, PriceRegion, VoteValue } from '@squadqueue/shared';
import { getSteamPrice, getSteamPrices } from './priceService.js';
import { checkPriceDropAlert } from './priceAlerts.js';
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

function buildGameDto(game: GameWithRelations, currentUserId: string, price: GamePrice): Game {
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
    ggDealsUrl: game.ggDealsUrl,
    coverImageUrl: game.coverImageUrl,
    status: game.status,
    price,
    targetPrice: game.targetPrice,
    votes: game.votes.map((v) => ({ user: toUserDto(v.user), value: v.value as VoteValue })),
    myVote: (myVote?.value as VoteValue | undefined) ?? null,
    voteScore,
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
  return buildGameDto(game, currentUserId, price);
}

export async function serializeGames(games: GameWithRelations[], currentUserId: string, region?: PriceRegion): Promise<Game[]> {
  const steamAppIds = games.map((g) => g.steamAppid).filter((id): id is number => id != null);
  const prices = await getSteamPrices(steamAppIds, { region });

  return games.map((game) => {
    const price = (game.steamAppid && prices.get(game.steamAppid)) || UNAVAILABLE_PRICE;
    if (game.targetPrice) void checkPriceDropAlert(game, price);
    return buildGameDto(game, currentUserId, price);
  });
}
