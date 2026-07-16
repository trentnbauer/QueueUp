import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { CreateRoomRequest, JoinRoomRequest, Room, RoomMember, RoomRole, UpdateRoomRequest, User } from '@squadqueue/shared';

export const roomsApi = {
  list: () => apiGet<{ rooms: Room[] }>('/api/rooms'),
  create: (body: CreateRoomRequest) => apiPost<{ room: Room }>('/api/rooms', body),
  join: (body: JoinRoomRequest) => apiPost<{ room: Room }>('/api/rooms/join', body),
  get: (roomId: string) => apiGet<{ room: Room }>(`/api/rooms/${roomId}`),
  update: (roomId: string, body: UpdateRoomRequest) => apiPatch<{ room: Room }>(`/api/rooms/${roomId}`, body),
  members: (roomId: string) => apiGet<{ members: RoomMember[] }>(`/api/rooms/${roomId}/members`),
  inviteCandidates: (roomId: string) => apiGet<{ users: User[] }>(`/api/rooms/${roomId}/invite-candidates`),
  addMember: (roomId: string, userId: string) => apiPost<{ added: boolean }>(`/api/rooms/${roomId}/members`, { userId }),
  setRole: (roomId: string, userId: string, role: RoomRole) =>
    apiPatch<{ role: RoomRole }>(`/api/rooms/${roomId}/members/${userId}/role`, { role }),
  removeMember: (roomId: string, userId: string) => apiDelete(`/api/rooms/${roomId}/members/${userId}`),
};
