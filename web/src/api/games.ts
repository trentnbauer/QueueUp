import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from './client';
import type {
  CreateGameRequest,
  Game,
  GameIntakeCandidate,
  GameSearchResult,
  UpdateGameStatusRequest,
  VoteRequest,
} from '@squadqueue/shared';

export const gamesApi = {
  shelf: () => apiGet<{ games: Game[] }>('/api/games'),
  room: (roomId: string) => apiGet<{ games: Game[] }>(`/api/rooms/${roomId}/games`),
  search: (q: string, roomId?: string | null) =>
    apiGet<{ results: GameSearchResult[] }>(
      `/api/games/search?q=${encodeURIComponent(q)}${roomId ? `&roomId=${roomId}` : ''}`,
    ),
  preview: (igdbId: number, roomId?: string | null) =>
    apiPost<{ preview: GameIntakeCandidate }>('/api/games/preview', { igdbId, roomId }),
  create: (body: CreateGameRequest) => apiPost<{ game: Game }>('/api/games', body),
  updateStatus: (id: string, body: UpdateGameStatusRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/status`, body),
  remove: (id: string) => apiDelete(`/api/games/${id}`),
  refreshPrice: (id: string) => apiPost<{ game: Game }>(`/api/games/${id}/refresh-price`),
  vote: (id: string, body: VoteRequest) => apiPut<{ game: Game }>(`/api/games/${id}/vote`, body),
};
