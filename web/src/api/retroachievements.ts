import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type {
  ConnectRetroAchievementsRequest,
  LibrarySyncProgress,
  PlayniteCompletionSuggestionsResult,
  PlayniteImportStarted,
  RetroAchievementsStatusResponse,
} from '@queueup/shared';

export const RETROACHIEVEMENTS_STATUS_QUERY_KEY = ['retroachievements', 'status'] as const;
/** Games a sync says you've finished (RetroAchievements beaten/mastered, or Playnite "Completed"), waiting for you to approve. */
export const COMPLETION_SUGGESTIONS_QUERY_KEY = ['games', 'completion-suggestions'] as const;

export const retroAchievementsApi = {
  status: () => apiGet<RetroAchievementsStatusResponse>('/api/me/retroachievements'),
  connect: (username: string, apiKey: string) => apiPut<RetroAchievementsStatusResponse>('/api/me/retroachievements', { username, apiKey } satisfies ConnectRetroAchievementsRequest),
  disconnect: () => apiDelete('/api/me/retroachievements'),
  sync: () => apiPost<PlayniteImportStarted>('/api/me/retroachievements/sync', {}),
  progress: () => apiGet<{ progress: LibrarySyncProgress | null }>('/api/me/retroachievements/sync/progress'),
  completionSuggestions: () => apiGet<PlayniteCompletionSuggestionsResult>('/api/games/playnite-completion-suggestions'),
  dismissCompletionSuggestion: (gameId: string) => apiDelete(`/api/games/playnite-completion-suggestions/${gameId}`),
};
