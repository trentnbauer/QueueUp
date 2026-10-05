import { apiGet, apiPost, apiPut } from './client';
import type { RoomWeeklyRecapResponse, UpdateRoomWeeklyRecapRequest } from '@queueup/shared';

/** The AI weekly room recap (issue #830). */
export const roomRecapApi = {
  get: (roomId: string) => apiGet<RoomWeeklyRecapResponse>(`/api/rooms/${roomId}/weekly-recap`),
  update: (roomId: string, body: UpdateRoomWeeklyRecapRequest) => apiPut<RoomWeeklyRecapResponse>(`/api/rooms/${roomId}/weekly-recap`, body),
  generate: (roomId: string) => apiPost<RoomWeeklyRecapResponse>(`/api/rooms/${roomId}/weekly-recap/generate`),
};

export const roomRecapKey = (roomId: string) => ['room-weekly-recap', roomId] as const;
