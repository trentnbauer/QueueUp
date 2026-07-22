import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { ApplyTagRequest, CreateTagRequest, Game, RenameTagRequest, Tag } from '@queueup/shared';

export const tagsApi = {
  list: () => apiGet<{ tags: Tag[] }>('/api/tags'),
  create: (body: CreateTagRequest) => apiPost<{ tag: Tag }>('/api/tags', body),
  rename: (id: string, body: RenameTagRequest) => apiPatch<{ tag: Tag }>(`/api/tags/${id}`, body),
  remove: (id: string) => apiDelete(`/api/tags/${id}`),
  applyToGame: (gameId: string, body: ApplyTagRequest) => apiPost<{ game: Game }>(`/api/games/${gameId}/tags`, body),
  removeFromGame: (gameId: string, tagId: string) => apiDelete<{ game: Game }>(`/api/games/${gameId}/tags/${tagId}`),
};
