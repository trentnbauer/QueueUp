import { apiGet, apiPost } from './client';
import type { LobbyGameId, MiniGameBestsResponse, MiniGameMeResponse, MiniGameScorePeriod, MiniGameScoreScope, MiniGameScoresResponse } from '@queueup/shared';

export const miniGamesApi = {
  scores: (game: LobbyGameId, scope: MiniGameScoreScope, period: MiniGameScorePeriod) =>
    apiGet<MiniGameScoresResponse>(`/api/minigames/scores?game=${game}&scope=${scope}&period=${period}`),
  bests: () => apiGet<MiniGameBestsResponse>('/api/minigames/bests'),
  me: (game: LobbyGameId) => apiGet<MiniGameMeResponse>(`/api/minigames/me?game=${game}`),
  /** A finished solo run. The server answers 204. */
  submit: (game: LobbyGameId, score: number) => apiPost<void>('/api/minigames/scores', { game, score }),
};
