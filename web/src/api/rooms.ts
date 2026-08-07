import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type {
  ActiveRoomSpin,
  BadgeDefinition,
  CreateRoomRequest,
  Game,
  GameSuggestion,
  JoinRoomRequest,
  PublicRoomSummary,
  Room,
  RoomActivityPage,
  RoomMember,
  RoomMemberStats,
  RoomRole,
  RoomSpinSession,
  UpdateRoomRequest,
  User,
} from '@queueup/shared';

export const roomsApi = {
  list: () => apiGet<{ rooms: Room[] }>('/api/rooms'),
  create: (body: CreateRoomRequest) => apiPost<{ room: Room; unlockedBadges: BadgeDefinition[] }>('/api/rooms', body),
  join: (body: JoinRoomRequest) => apiPost<{ room: Room; unlockedBadges: BadgeDefinition[] }>('/api/rooms/join', body),
  publicRooms: () => apiGet<{ rooms: PublicRoomSummary[] }>('/api/rooms/public'),
  joinPublic: (roomId: string) =>
    apiPost<{ room: Room; unlockedBadges: BadgeDefinition[] }>(`/api/rooms/${roomId}/join-public`, {}),
  get: (roomId: string) => apiGet<{ room: Room }>(`/api/rooms/${roomId}`),
  update: (roomId: string, body: UpdateRoomRequest) => apiPatch<{ room: Room }>(`/api/rooms/${roomId}`, body),
  delete: (roomId: string) => apiDelete(`/api/rooms/${roomId}`),
  members: (roomId: string) => apiGet<{ members: RoomMember[] }>(`/api/rooms/${roomId}/members`),
  memberStats: (roomId: string, userId: string) => apiGet<RoomMemberStats>(`/api/rooms/${roomId}/members/${userId}/stats`),
  inviteCandidates: (roomId: string) => apiGet<{ users: User[] }>(`/api/rooms/${roomId}/invite-candidates`),
  addMember: (roomId: string, userId: string) => apiPost<{ added: boolean }>(`/api/rooms/${roomId}/members`, { userId }),
  setRole: (roomId: string, userId: string, role: RoomRole) =>
    apiPatch<{ role: RoomRole }>(`/api/rooms/${roomId}/members/${userId}/role`, { role }),
  removeMember: (roomId: string, userId: string) => apiDelete(`/api/rooms/${roomId}/members/${userId}`),
  activity: (roomId: string, before?: string) =>
    apiGet<RoomActivityPage>(`/api/rooms/${roomId}/activity${before ? `?before=${encodeURIComponent(before)}` : ''}`),
};

/** A room's pending game suggestions (issue #362) - Room Master/Moderator only, see
 * GameSuggestion in schema.prisma. Suggestions are created by POST /api/games (gamesApi.create)
 * itself, not through this API - there's no separate "suggest" call. */
export const gameSuggestionsApi = {
  list: (roomId: string) => apiGet<{ suggestions: GameSuggestion[] }>(`/api/rooms/${roomId}/suggestions`),
  approve: (roomId: string, suggestionId: string) =>
    apiPost<{ game: Game }>(`/api/rooms/${roomId}/suggestions/${suggestionId}/approve`),
  decline: (roomId: string, suggestionId: string) => apiDelete(`/api/rooms/${roomId}/suggestions/${suggestionId}`),
};

/** A room's shared Spin the Wheel session (see RoomSpinSession) - `nudge` is the left/right
 * click-to-slow/speed-up gesture mid-spin, `restart` is "Spin again" post-settle (start a whole
 * fresh strip/physics run), `skipWait` collapses the "waiting for members" pause a fresh start
 * begins with (issue #420) so the spin starts moving right now, `ready` marks the caller present
 * for the waiting room's readyCount (issue #488 - called only from inside the modal itself, not
 * from the background `get` poll, so it actually reflects who has Spin the Wheel open), and `close`
 * ends the session for every member (used once a winner's actually committed to), never called
 * just for dismissing the modal locally. */
export const roomSpinApi = {
  /** Cross-room, cheap-payload counterpart to `get` below - see ActiveRoomSpin's doc comment. */
  activeSpins: () => apiGet<{ spins: ActiveRoomSpin[] }>('/api/rooms/active-spins'),
  get: (roomId: string) => apiGet<{ spin: RoomSpinSession | null }>(`/api/rooms/${roomId}/spin`),
  start: (roomId: string) => apiPost<{ spin: RoomSpinSession }>(`/api/rooms/${roomId}/spin/start`),
  nudge: (roomId: string, direction: 'left' | 'right') =>
    apiPost<{ spin: RoomSpinSession }>(`/api/rooms/${roomId}/spin/nudge`, { direction }),
  restart: (roomId: string) => apiPost<{ spin: RoomSpinSession }>(`/api/rooms/${roomId}/spin/restart`),
  skipWait: (roomId: string) => apiPost<{ spin: RoomSpinSession }>(`/api/rooms/${roomId}/spin/skip-wait`),
  ready: (roomId: string) => apiPost<{ spin: RoomSpinSession; unlockedBadges: BadgeDefinition[] }>(`/api/rooms/${roomId}/spin/ready`),
  close: (roomId: string) => apiDelete(`/api/rooms/${roomId}/spin`),
};
