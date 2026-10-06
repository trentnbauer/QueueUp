import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from './client';
import type {
  AiDuplicateScanResponse,
  DuplicateCandidateCountResponse,
  DuplicateCandidatesResponse,
  AiSearchRequest,
  AiSearchResponse,
  AiSearchRunRequest,
  AiBacklogCoachResponse,
  AiPriceAdviceResponse,
  AiRecommendRequest,
  AiRecommendResponse,
  AiTonightRequest,
  AiTonightResponse,
  DismissDuplicateRequest,
  UpcomingDlc,
  PriceHistoryResponse,
  RemoveVoteResponse,
  ResolveSensitiveGamesRequest,
  RecommendedGame,
  SensitiveGamesResponse,
  BacklogInsights,
  BadgeDefinition,
  BarcodeGameMatch,
  BulkRemoveGamesRequest,
  BulkUpdateGameStatusRequest,
  CollectionGamesResult,
  CollectionSearchResult,
  CreateGameRequest,
  GameTrailerResponse,
  CreateGameResponse,
  CrossRoomBeaten,
  CrossRoomPlaying,
  Game,
  GameSearchResult,
  MoveGameRequest,
  NextPickResponse,
  PlayerAchievements,
  PlayLogEntry,
  PriceRegion,
  SetGameHiddenRequest,
  SetGameOwnershipRequest,
  SetGameReviewRequest,
  SetGamePrerequisiteRequest,
  SetManualPriceRequest,
  SetSteamMatchRequest,
  SetIgdbMatchRequest,
  MergeGameRequest,
  MergedGame,
  SetTargetPriceRequest,
  ShelfActivityPage,
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

function libraryQuery(region?: PriceRegion, q?: string): string {
  const params = new URLSearchParams();
  if (region) params.set('region', region);
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Query string shared by the Add Game browse calls (trending, collections). */
function browseQuery(roomId: string | null | undefined, hideAddons: boolean, allPlatforms: boolean): string {
  const params = new URLSearchParams();
  if (roomId) params.set('roomId', roomId);
  if (!hideAddons) params.set('hideAddons', 'false');
  if (allPlatforms) params.set('allPlatforms', 'true');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const gamesApi = {
  shelf: (region?: PriceRegion, q?: string) =>
    apiGet<{ games: Game[]; truncated: boolean; totalCount: number }>(`/api/games${libraryQuery(region, q)}`),
  room: (roomId: string, region?: PriceRegion, q?: string) =>
    apiGet<{ games: Game[]; truncated: boolean; totalCount: number }>(`/api/rooms/${roomId}/games${libraryQuery(region, q)}`),
  search: (q: string, roomId?: string | null, offset = 0, hideAddons = true, includeOwned = false, allPlatforms = false) =>
    apiGet<{ results: GameSearchResult[]; collections: CollectionSearchResult[]; nextOffset: number; hasMore: boolean }>(
      `/api/games/search?q=${encodeURIComponent(q)}${roomId ? `&roomId=${roomId}` : ''}${offset ? `&offset=${offset}` : ''}${hideAddons ? '' : '&hideAddons=false'}${includeOwned ? '&includeOwned=true' : ''}${allPlatforms ? '&allPlatforms=true' : ''}`,
    ),
  collectionGames: (collectionId: number, roomId?: string | null, hideAddons = true, allPlatforms = false) =>
    apiGet<CollectionGamesResult>(`/api/games/collections/${collectionId}${browseQuery(roomId, hideAddons, allPlatforms)}`),
  /** Issue #402 - resolves a scanned UPC/EAN barcode via ScanDex. Null result means no match (or
   * ScanDex isn't configured) - not an error, just "couldn't find that one." */
  barcodeLookup: (value: string) => apiGet<{ result: BarcodeGameMatch | null }>(`/api/games/barcode-lookup?value=${encodeURIComponent(value)}`),
  /** Games like what's already on the shelf / in the room (IGDB similar games); `coop` keeps co-op only. */
  recommendations: (roomId: string | null, coop: boolean, allPlatforms = false) =>
    apiGet<{ results: RecommendedGame[] }>(
      `/api/games/recommendations?${new URLSearchParams({ ...(roomId && { roomId }), ...(coop && { coop: 'true' }), ...(allPlatforms && { allPlatforms: 'true' }) })}`,
    ),
  /** Stops a game being recommended to this person again (IGDB list and AI picks). */
  hideRecommendation: (igdbId: number) => apiPost<void>('/api/games/recommendations/hide', { igdbId }),
  trending: (roomId?: string | null, hideAddons = true, allPlatforms = false) =>
    apiGet<{ results: GameSearchResult[] }>(`/api/games/trending${browseQuery(roomId, hideAddons, allPlatforms)}`),
  /** Every DLC/expansion IGDB has on file for this game (issue #338), already excluding anything
   * that's already on this game's own room/shelf. */
  priceHistory: (id: string, currency?: string | null) =>
    apiGet<PriceHistoryResponse>(`/api/games/${id}/price-history${currency ? `?currency=${encodeURIComponent(currency)}` : ''}`),
  trailer: (id: string) => apiGet<GameTrailerResponse>(`/api/games/${id}/trailer`),
  /** The trailer for a game that is not on a list yet (AI picks). */
  igdbTrailer: (igdbId: number) => apiGet<GameTrailerResponse>(`/api/games/igdb/${igdbId}/trailer`),
  dlc: (id: string) => apiGet<{ results: GameSearchResult[] }>(`/api/games/${id}/dlc`),
  create: (body: CreateGameRequest) => apiPost<CreateGameResponse>('/api/games', body),
  updateStatus: (id: string, body: UpdateGameStatusRequest) =>
    apiPatch<UpdateGameStatusResponse>(`/api/games/${id}/status`, body),
  syncShelfBeaten: (id: string) =>
    apiPost<{ ok: true; unlockedBadges: BadgeDefinition[] }>(`/api/games/${id}/sync-shelf-beaten`),
  bulkUpdateStatus: (body: BulkUpdateGameStatusRequest, region?: PriceRegion) =>
    apiPatch<{ games: Game[]; unlockedBadges: BadgeDefinition[] }>(`/api/games/bulk-status${region ? `?region=${region}` : ''}`, body),
  remove: (id: string) => apiDelete(`/api/games/${id}`),
  bulkRemove: (body: BulkRemoveGamesRequest) => apiDelete('/api/games/bulk', body),
  refreshPrice: (id: string, region?: PriceRegion) =>
    apiPost<{ game: Game }>(`/api/games/${id}/refresh-price${region ? `?region=${region}` : ''}`),
  steamSearch: (id: string, q?: string) =>
    apiGet<{ results: SteamStoreMatch[] }>(`/api/games/${id}/steam-search${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  setSteamMatch: (id: string, body: SetSteamMatchRequest) => apiPatch<{ game: Game }>(`/api/games/${id}/steam-match`, body),
  mergedList: () => apiGet<{ merged: MergedGame[] }>('/api/games/merged'),
  forgetMerged: (fromIgdbId: number) => apiDelete(`/api/games/merged/${fromIgdbId}`),
  igdbSearch: (id: string, q: string) => apiGet<{ results: GameSearchResult[]; existingIgdbIds: number[] }>(`/api/games/${id}/igdb-search?q=${encodeURIComponent(q)}`),
  aiSearch: (body: AiSearchRequest) => apiPost<AiSearchResponse>('/api/games/ai-search', body),
  aiSearchRun: (body: AiSearchRunRequest) => apiPost<{ results: GameSearchResult[] }>('/api/games/ai-search/run', body),
  aiBacklogCoach: () => apiPost<AiBacklogCoachResponse>('/api/games/ai-backlog-coach'),
  aiPriceAdvice: (id: string) => apiPost<AiPriceAdviceResponse>(`/api/games/${id}/ai-price-advice`),
  aiRecommend: (roomId: string | null) => apiPost<AiRecommendResponse>('/api/games/ai-recommend', (roomId ? { roomId } : {}) satisfies AiRecommendRequest),
  aiTonight: (body: AiTonightRequest) => apiPost<AiTonightResponse>('/api/games/ai-tonight', body),
  upcomingDlc: () => apiGet<{ dlcs: UpcomingDlc[] }>('/api/games/upcoming-dlc'),
  ignoreUpcomingDlc: (igdbId: number) => apiPost<void>(`/api/games/upcoming-dlc/${igdbId}/ignore`),
  /** `fresh` asks the AI afresh instead of reusing its earlier answers ("Scan again"). */
  aiScanDuplicates: (fresh = false) => apiPost<AiDuplicateScanResponse>('/api/games/duplicates/ai-scan', fresh ? { fresh: true } : {}),
  duplicateCandidates: () => apiGet<DuplicateCandidatesResponse>('/api/games/duplicates'),
  duplicateCandidateCount: () => apiGet<DuplicateCandidateCountResponse>('/api/games/duplicates/count'),
  dismissDuplicate: (body: DismissDuplicateRequest) => apiPost<void>('/api/games/duplicates/dismiss', body),
  mergeGame: (id: string, body: MergeGameRequest) => apiPost<{ game: Game; mergedFromId: string; undoToken?: string }>(`/api/games/${id}/merge`, body),
  /** Undoes a merge or re-match within a few minutes of it, using the token that came back with it. */
  undoChange: (token: string) => apiPost<{ game: Game }>('/api/games/undo-change', { token }),
  setIgdbMatch: (id: string, body: SetIgdbMatchRequest) => apiPatch<{ game: Game; mergedFromId: string | null; undoToken?: string }>(`/api/games/${id}/igdb-match`, body),
  setTargetPrice: (id: string, body: SetTargetPriceRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/target-price`, body),
  setManualPrice: (id: string, body: SetManualPriceRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/manual-price`, body),
  vote: (id: string, body: VoteRequest) => apiPut<{ game: Game; unlockedBadges: BadgeDefinition[] }>(`/api/games/${id}/vote`, body),
  voteRemove: (id: string) => apiPost<RemoveVoteResponse>(`/api/games/${id}/remove-vote`, {}),
  unvoteRemove: (id: string) => apiDelete<RemoveVoteResponse>(`/api/games/${id}/remove-vote`),
  unvote: (id: string) => apiDelete<{ game: Game }>(`/api/games/${id}/vote`),
  setOwnership: (id: string, body: SetGameOwnershipRequest) =>
    apiPatch<{ game: Game; unlockedBadges: BadgeDefinition[] }>(`/api/games/${id}/ownership`, body),
  setPrerequisite: (id: string, body: SetGamePrerequisiteRequest) =>
    apiPatch<{ game: Game }>(`/api/games/${id}/prerequisite`, body),
  move: (id: string, body: MoveGameRequest) => apiPost<{ game: Game }>(`/api/games/${id}/move`, body),
  importSteamLibrary: () => apiPost<SteamImportStarted>('/api/games/import-steam-library'),
  importSteamLibraryProgress: () =>
    apiGet<{ progress: SteamImportProgress | null }>('/api/games/import-steam-library/progress'),
  importSteamWishlist: () => apiPost<SteamWishlistImportStarted>('/api/games/import-steam-wishlist'),
  importSteamWishlistProgress: () =>
    apiGet<{ progress: SteamWishlistImportProgress | null }>('/api/games/import-steam-wishlist/progress'),
  achievements: (id: string) =>
    apiGet<{ players: PlayerAchievements[]; unlockedBadges: BadgeDefinition[] }>(`/api/games/${id}/achievements`),
  playLog: (id: string) => apiGet<{ entries: PlayLogEntry[] }>(`/api/games/${id}/play-log`),
  yearInReview: () => apiGet<YearInReview>('/api/me/year-in-review'),
  currentlyPlaying: () => apiGet<CrossRoomPlaying>('/api/me/currently-playing'),
  beaten: () => apiGet<CrossRoomBeaten>('/api/me/beaten'),
  nextPick: () => apiGet<NextPickResponse>('/api/me/next-pick'),
  backlogInsights: () => apiGet<BacklogInsights>('/api/me/backlog-insights'),
  activity: (before?: string) =>
    apiGet<ShelfActivityPage>(`/api/me/activity${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  setReleaseAlert: (id: string, enabled: boolean) => apiPatch<{ game: Game }>(`/api/games/${id}/release-alert`, { enabled }),
  sensitiveGames: () => apiGet<SensitiveGamesResponse>('/api/me/sensitive-games'),
  resolveSensitiveGames: (body: ResolveSensitiveGamesRequest) => apiPost<void>('/api/me/sensitive-games/resolve', body),
  setHidden: (id: string, body: SetGameHiddenRequest) => apiPatch<{ game: Game }>(`/api/games/${id}/hidden`, body),
  setReview: (id: string, body: SetGameReviewRequest) => apiPut<{ game: Game }>(`/api/games/${id}/review`, body),
  syncSteamCompletions: () => apiPost<SteamCompletionsSyncResult>('/api/games/sync-steam-completions'),
};

export const MERGED_GAMES_QUERY_KEY = ['games', 'merged'] as const;
/** Pairs that look like the same game by title alone (no AI) - drives the shelf's duplicates nudge. */
export const DUPLICATE_COUNT_QUERY_KEY = ['duplicate-candidates'] as const;
export const DUPLICATE_LIST_QUERY_KEY = ['duplicate-candidate-list'] as const;
