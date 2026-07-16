import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from './client';
import type {
  CreateGameRequest,
  Game,
  GameSearchResult,
  ImportSteamLibraryResult,
  MoveGameRequest,
  PriceRegion,
  UpdateGameStatusRequest,
  VoteRequest,
} from '@squadqueue/shared';

export const gamesApi = {
  shelf: (region?: PriceRegion) =>
    apiGet<{ games: Game[]; truncated: boolean }>(`/api/games${region ? `?region=${region}` : ''}`),
  room: (roomId: string, region?: PriceRegion) =>
    apiGet<{ games: Game[]; truncated: boolean }>(`/api/rooms/${roomId}/games${region ? `?region=${region}` : ''}`),
  search: (q: string, roomId?: string | null) =>
    apiGet<{ results: GameSearchResult[] }>(
      `/api/games/search?q=${encodeURIComponent(q)}${roomId ? `&roomId=${roomId}` : ''}`,
    ),
  create: (body: CreateGameRequest) => apiPost<{ game: Game }>('/api/games', body),
  updateStatus: (id: string, body: UpdateGameStatusRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/status`, body),
  remove: (id: string) => apiDelete(`/api/games/${id}`),
  refreshPrice: (id: string) => apiPost<{ game: Game }>(`/api/games/${id}/refresh-price`),
  vote: (id: string, body: VoteRequest) => apiPut<{ game: Game }>(`/api/games/${id}/vote`, body),
  move: (id: string, body: MoveGameRequest) => apiPost<{ game: Game }>(`/api/games/${id}/move`, body),
  importSteamLibrary: () => apiPost<ImportSteamLibraryResult>('/api/games/import-steam-library'),
};
