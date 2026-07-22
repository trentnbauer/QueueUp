import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from './client';
import type {
  BulkRemoveGamesRequest,
  BulkUpdateGameStatusRequest,
  CollectionGamesResult,
  CollectionSearchResult,
  CreateGameRequest,
  Game,
  GameSearchResult,
  MoveGameRequest,
  PlayerAchievements,
  PriceRegion,
  SetGameOwnershipRequest,
  SetGamePrerequisiteRequest,
  SetTargetPriceRequest,
  SteamCompletionsSyncResult,
  SteamImportProgress,
  SteamImportStarted,
  SteamWishlistImportProgress,
  SteamWishlistImportStarted,
  UpdateGameStatusRequest,
  VoteRequest,
  YearInReview,
} from '@queueup/shared';

export const gamesApi = {
  shelf: (region?: PriceRegion) =>
    apiGet<{ games: Game[]; truncated: boolean }>(`/api/games${region ? `?region=${region}` : ''}`),
  room: (roomId: string, region?: PriceRegion) =>
    apiGet<{ games: Game[]; truncated: boolean }>(`/api/rooms/${roomId}/games${region ? `?region=${region}` : ''}`),
  search: (q: string, roomId?: string | null) =>
    apiGet<{ results: GameSearchResult[]; collections: CollectionSearchResult[] }>(
      `/api/games/search?q=${encodeURIComponent(q)}${roomId ? `&roomId=${roomId}` : ''}`,
    ),
  collectionGames: (collectionId: number, roomId?: string | null) =>
    apiGet<CollectionGamesResult>(
      `/api/games/collections/${collectionId}${roomId ? `?roomId=${roomId}` : ''}`,
    ),
  create: (body: CreateGameRequest) => apiPost<{ game: Game }>('/api/games', body),
  updateStatus: (id: string, body: UpdateGameStatusRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/status`, body),
  bulkUpdateStatus: (body: BulkUpdateGameStatusRequest, region?: PriceRegion) =>
    apiPatch<{ games: Game[] }>(`/api/games/bulk-status${region ? `?region=${region}` : ''}`, body),
  remove: (id: string) => apiDelete(`/api/games/${id}`),
  bulkRemove: (body: BulkRemoveGamesRequest) => apiDelete('/api/games/bulk', body),
  refreshPrice: (id: string, region?: PriceRegion) =>
    apiPost<{ game: Game }>(`/api/games/${id}/refresh-price${region ? `?region=${region}` : ''}`),
  setTargetPrice: (id: string, body: SetTargetPriceRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/target-price`, body),
  vote: (id: string, body: VoteRequest) => apiPut<{ game: Game }>(`/api/games/${id}/vote`, body),
  setOwnership: (id: string, body: SetGameOwnershipRequest) => apiPatch<{ game: Game }>(`/api/games/${id}/ownership`, body),
  setPrerequisite: (id: string, body: SetGamePrerequisiteRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/prerequisite`, body),
  move: (id: string, body: MoveGameRequest) => apiPost<{ game: Game }>(`/api/games/${id}/move`, body),
  importSteamLibrary: () => apiPost<SteamImportStarted>('/api/games/import-steam-library'),
  importSteamLibraryProgress: () =>
    apiGet<{ progress: SteamImportProgress | null }>('/api/games/import-steam-library/progress'),
  importSteamWishlist: () => apiPost<SteamWishlistImportStarted>('/api/games/import-steam-wishlist'),
  importSteamWishlistProgress: () =>
    apiGet<{ progress: SteamWishlistImportProgress | null }>('/api/games/import-steam-wishlist/progress'),
  achievements: (id: string) => apiGet<{ players: PlayerAchievements[] }>(`/api/games/${id}/achievements`),
  yearInReview: () => apiGet<YearInReview>('/api/me/year-in-review'),
  syncSteamCompletions: () => apiPost<SteamCompletionsSyncResult>('/api/games/sync-steam-completions'),
};
