import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { CreateRoomRequest, JoinRoomRequest, Room, RoomMember, UpdateRoomRequest } from '@squadqueue/shared';

export const roomsApi = {
  list: () => apiGet<{ rooms: Room[] }>('/api/rooms'),
  create: (body: CreateRoomRequest) => apiPost<{ room: Room }>('/api/rooms', body),
  join: (body: JoinRoomRequest) => apiPost<{ room: Room }>('/api/rooms/join', body),
  get: (roomId: string) => apiGet<{ room: Room }>(`/api/rooms/${roomId}`),
  update: (roomId: string, body: UpdateRoomRequest) => apiPatch<{ room: Room }>(`/api/rooms/${roomId}`, body),
  members: (roomId: string) => apiGet<{ members: RoomMember[] }>(`/api/rooms/${roomId}/members`),
  promote: (roomId: string, userId: string) =>
    apiPost<{ role: string }>(`/api/rooms/${roomId}/members/${userId}/promote`),
  removeMember: (roomId: string, userId: string) => apiDelete(`/api/rooms/${roomId}/members/${userId}`),
};
