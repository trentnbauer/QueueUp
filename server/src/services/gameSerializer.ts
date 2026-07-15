import type { Prisma } from '@prisma/client';
import type { Game, GamePrice, VoteValue } from '@squadqueue/shared';
import { getSteamPrice } from './priceService.js';
import { toUserDto } from '../util/dto.js';

const gameWithRelations = {
  include: {
    adder: true,
    votes: { include: { user: true } },
  },
} satisfies Prisma.GameDefaultArgs;

export type GameWithRelations = Prisma.GameGetPayload<typeof gameWithRelations>;
export const gameInclude = gameWithRelations.include;

async function resolvePrice(game: GameWithRelations): Promise<GamePrice> {
  if (game.steamAppid) {
    return getSteamPrice(game.steamAppid);
  }
  return { amount: null, currency: null, source: 'unavailable' };
}

export async function serializeGame(game: GameWithRelations, currentUserId: string): Promise<Game> {
  const price = await resolvePrice(game);
  const myVote = game.votes.find((v) => v.userId === currentUserId);
  const voteScore = game.votes.reduce((sum, v) => sum + v.value, 0);

  return {
    id: game.id,
    roomId: game.roomId,
    addedBy: toUserDto(game.adder),
    title: game.title,
    platform: game.platform,
    genre: game.genre,
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

export async function serializeGames(games: GameWithRelations[], currentUserId: string): Promise<Game[]> {
  return Promise.all(games.map((g) => serializeGame(g, currentUserId)));
}
