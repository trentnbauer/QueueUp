import type { Prisma } from '@prisma/client';
import type { Game, GamePrice, PriceRegion, VoteValue } from '@squadqueue/shared';
import { getSteamPrice, getSteamPrices } from './priceService.js';
import { toUserDto } from '../util/dto.js';

const gameWithRelations = {
  include: {
    adder: true,
    votes: { include: { user: true } },
  },
} satisfies Prisma.GameDefaultArgs;

export type GameWithRelations = Prisma.GameGetPayload<typeof gameWithRelations>;
export const gameInclude = gameWithRelations.include;

const UNAVAILABLE_PRICE: GamePrice = { amount: null, currency: null, source: 'unavailable', historicalLow: null };

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
    maxCoopPlayers: game.maxCoopPlayers,
    ggDealsUrl: game.ggDealsUrl,
    coverImageUrl: game.coverImageUrl,
    status: game.status,
    price,
    votes: game.votes.map((v) => ({ user: toUserDto(v.user), value: v.value as VoteValue })),
    myVote: (myVote?.value as VoteValue | undefined) ?? null,
    voteScore,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

export async function serializeGame(game: GameWithRelations, currentUserId: string, region?: PriceRegion): Promise<Game> {
  const price = game.steamAppid ? await getSteamPrice(game.steamAppid, { region }) : UNAVAILABLE_PRICE;
  return buildGameDto(game, currentUserId, price);
}

export async function serializeGames(games: GameWithRelations[], currentUserId: string, region?: PriceRegion): Promise<Game[]> {
  const steamAppIds = games.map((g) => g.steamAppid).filter((id): id is number => id != null);
  const prices = await getSteamPrices(steamAppIds, { region });

  return games.map((game) =>
    buildGameDto(game, currentUserId, (game.steamAppid && prices.get(game.steamAppid)) || UNAVAILABLE_PRICE),
  );
}
