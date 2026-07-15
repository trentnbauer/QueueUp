import { apiGet } from './client';
import type { User } from '@squadqueue/shared';

export const authApi = {
  me: () => apiGet<{ user: User | null; steamLinked: boolean }>('/api/me'),
  providers: () => apiGet<{ providers: string[] }>('/api/auth/providers'),
  loginUrl: (provider: string) => `/auth/${provider}/login`,
  logoutUrl: '/auth/logout',
};
