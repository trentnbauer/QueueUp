import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type { CreateMiniGameLobbyRequest, GuestJoinRequest, GuestJoinResponse, PublicMiniGameLobbiesResponse, LobbyGameId, MiniGameBestsResponse, MiniGameLobbiesResponse, MiniGameLobbyDto, MiniGameMeResponse, MiniGameRatingValue, MiniGameRatingsResponse, MiniGameScorePeriod, MiniGameScoreScope, MiniGameScoresResponse } from '@queueup/shared';

export const miniGamesApi = {
  scores: (game: LobbyGameId, scope: MiniGameScoreScope, period: MiniGameScorePeriod) =>
    apiGet<MiniGameScoresResponse>(`/api/minigames/scores?game=${game}&scope=${scope}&period=${period}`),
  bests: () => apiGet<MiniGameBestsResponse>('/api/minigames/bests'),
  me: (game: LobbyGameId) => apiGet<MiniGameMeResponse>(`/api/minigames/me?game=${game}`),
  ratings: () => apiGet<MiniGameRatingsResponse>('/api/minigames/ratings'),
  /** Thumbs up (1) or down (-1) for a game; the server answers 204. */
  rate: (game: LobbyGameId, rating: MiniGameRatingValue) => apiPut<void>('/api/minigames/rating', { game, rating }),
  lobbies: () => apiGet<MiniGameLobbiesResponse>('/api/minigames/lobbies'),
  /** Guests (no account). `ref` is a public lobby's id or an invite code. */
  publicLobbies: () => apiGet<PublicMiniGameLobbiesResponse>('/api/minigames/public-lobbies'),
  guestJoin: (ref: string, body: GuestJoinRequest) => apiPost<GuestJoinResponse>(`/api/minigames/lobbies/${encodeURIComponent(ref)}/guest-join`, body),
  guestLobby: (id: string, token: string) => apiGet<MiniGameLobbyDto>(`/api/minigames/lobbies/${encodeURIComponent(id)}/guest-info?guest=${encodeURIComponent(token)}`),
  lobby: (id: string) => apiGet<MiniGameLobbyDto>(`/api/minigames/lobbies/${encodeURIComponent(id)}`),
  openLobby: (body: CreateMiniGameLobbyRequest) => apiPost<MiniGameLobbyDto>('/api/minigames/lobbies', body),
  joinLobby: (code: string) => apiPost<MiniGameLobbyDto>('/api/minigames/lobbies/join', { code }),
  closeLobby: (id: string) => apiDelete(`/api/minigames/lobbies/${encodeURIComponent(id)}`),
};
