import { apiGet } from './client';
import type { PublicUserProfile } from '@queueup/shared';

/** The one unauthenticated fetch in the whole app (issue #511) - apiGet's `credentials: 'include'`
 * still sends whatever cookie the browser has, but the server route never reads it (no
 * requireAuth call - see routes/publicProfile.ts), so this works identically for a signed-in
 * viewer looking at someone else's page and a visitor with no QueueUp account at all. */
export const publicProfileApi = {
  get: (userId: string) => apiGet<PublicUserProfile>(`/api/public/users/${encodeURIComponent(userId)}`),
};
