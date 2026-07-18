import { apiDelete, apiGet, apiPost } from './client';
import type { GeneratePlayniteTokenResult, PlayniteTokenStatus } from '@queueup/shared';

export const playniteApi = {
  getTokenStatus: () => apiGet<PlayniteTokenStatus>('/api/playnite/token'),
  generateToken: () => apiPost<GeneratePlayniteTokenResult>('/api/playnite/token'),
  revokeToken: () => apiDelete('/api/playnite/token'),
};
