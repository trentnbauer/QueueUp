import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type { GenerateYearStoryRequest, UpdateYearStoryRequest, YearStoryDto } from '@queueup/shared';

type StoryResponse = { story: YearStoryDto | null };

/** The Year in Review story (issue #826). `roomId` null is the person's own; otherwise that room's. */
export const yearStoryApi = {
  get: (roomId: string | null) => apiGet<StoryResponse>(roomId ? `/api/rooms/${roomId}/year-story` : '/api/me/year-story'),
  generate: (roomId: string | null, body: GenerateYearStoryRequest) =>
    apiPost<{ story: YearStoryDto }>(roomId ? `/api/rooms/${roomId}/year-story/generate` : '/api/me/year-story/generate', body),
  update: (roomId: string | null, body: UpdateYearStoryRequest) =>
    apiPut<{ story: YearStoryDto }>(roomId ? `/api/rooms/${roomId}/year-story` : '/api/me/year-story', body),
  remove: (roomId: string | null) => apiDelete(roomId ? `/api/rooms/${roomId}/year-story` : '/api/me/year-story'),
};

export const yearStoryKey = (roomId: string | null) => ['year-story', roomId] as const;
