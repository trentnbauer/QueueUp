import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from './client';
import type {
  BarcodeGameMatch,
  BulkRemoveGamesRequest,
  BulkUpdateGameStatusRequest,
  CollectionGamesResult,
  CollectionSearchResult,
  CreateGameRequest,
  CreateGameResponse,
  CrossRoomPlaying,
  Game,
  GameSearchResult,
  MoveGameRequest,
  PlayerAchievements,
  PlayLogEntry,
  PriceRegion,
  SetGameOwnershipRequest,
  SetGamePrerequisiteRequest,
  SetManualPriceRequest,
  SetSteamMatchRequest,
  SetTargetPriceRequest,
  SteamCompletionsSyncResult,
  SteamImportProgress,
  SteamImportStarted,
  SteamStoreMatch,
  SteamWishlistImportProgress,
  SteamWishlistImportStarted,
  UpdateGameStatusRequest,
  UpdateGameStatusResponse,
  VoteRequest,
  YearInReview,
} from '@queueup/shared';

export const gamesApi = {
  shelf: (region?: PriceRegion) =>
    apiGet<{ games: Game[]; truncated: boolean }>(`/api/games${region ? `?region=${region}` : ''}`),
  room: (roomId: string, region?: PriceRegion) =>
    apiGet<{ games: Game[]; truncated: boolean }>(`/api/rooms/${roomId}/games${region ? `?region=${region}` : ''}`),
  search: (q: string, roomId?: string | null, offset = 0, hideAddons = true) =>
    apiGet<{ results: GameSearchResult[]; collections: CollectionSearchResult[]; nextOffset: number; hasMore: boolean }>(
      `/api/games/search?q=${encodeURIComponent(q)}${roomId ? `&roomId=${roomId}` : ''}${offset ? `&offset=${offset}` : ''}${hideAddons ? '' : '&hideAddons=false'}`,
    ),
  collectionGames: (collectionId: number, roomId?: string | null, hideAddons = true) =>
    apiGet<CollectionGamesResult>(
      `/api/games/collections/${collectionId}${roomId ? `?roomId=${roomId}` : ''}${hideAddons ? '' : `${roomId ? '&' : '?'}hideAddons=false`}`,
    ),
  /** Issue #402 - resolves a scanned UPC/EAN barcode via ScanDex. Null result means no match (or
   * ScanDex isn't configured) - not an error, just "couldn't find that one." */
  barcodeLookup: (value: string) => apiGet<{ result: BarcodeGameMatch | null }>(`/api/games/barcode-lookup?value=${encodeURIComponent(value)}`),
  trending: (roomId?: string | null, hideAddons = true) =>
    apiGet<{ results: GameSearchResult[] }>(
      `/api/games/trending${roomId ? `?roomId=${roomId}` : ''}${hideAddons ? '' : `${roomId ? '&' : '?'}hideAddons=false`}`,
    ),
  /** Every DLC/expansion IGDB has on file for this game (issue #338), already excluding anything
   * that's already on this game's own room/shelf. */
  dlc: (id: string) => apiGet<{ results: GameSearchResult[] }>(`/api/games/${id}/dlc`),
  create: (body: CreateGameRequest) => apiPost<CreateGameResponse>('/api/games', body),
  updateStatus: (id: string, body: UpdateGameStatusRequest) =>
    apiPatch<UpdateGameStatusResponse>(`/api/games/${id}/status`, body),
  syncShelfBeaten: (id: string) => apiPost<{ ok: true }>(`/api/games/${id}/sync-shelf-beaten`),
  bulkUpdateStatus: (body: BulkUpdateGameStatusRequest, region?: PriceRegion) =>
    apiPatch<{ games: Game[] }>(`/api/games/bulk-status${region ? `?region=${region}` : ''}`, body),
  remove: (id: string) => apiDelete(`/api/games/${id}`),
  bulkRemove: (body: BulkRemoveGamesRequest) => apiDelete('/api/games/bulk', body),
  refreshPrice: (id: string, region?: PriceRegion) =>
    apiPost<{ game: Game }>(`/api/games/${id}/refresh-price${region ? `?region=${region}` : ''}`),
  steamSearch: (id: string, q?: string) =>
    apiGet<{ results: SteamStoreMatch[] }>(`/api/games/${id}/steam-search${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  setSteamMatch: (id: string, body: SetSteamMatchRequest) => apiPatch<{ game: Game }>(`/api/games/${id}/steam-match`, body),
  setTargetPrice: (id: string, body: SetTargetPriceRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/target-price`, body),
  setManualPrice: (id: string, body: SetManualPriceRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/manual-price`, body),
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
  playLog: (id: string) => apiGet<{ entries: PlayLogEntry[] }>(`/api/games/${id}/play-log`),
  yearInReview: () => apiGet<YearInReview>('/api/me/year-in-review'),
  currentlyPlaying: () => apiGet<CrossRoomPlaying>('/api/me/currently-playing'),
  syncSteamCompletions: () => apiPost<SteamCompletionsSyncResult>('/api/games/sync-steam-completions'),
};
