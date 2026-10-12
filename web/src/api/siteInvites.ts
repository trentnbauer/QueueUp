import { apiDelete, apiGet, apiPost } from './client';

export interface SiteInvite {
  id: string;
  code: string;
  label: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

export const siteInvitesApi = {
  list: () => apiGet<{ signupMode: 'open' | 'invite'; invites: SiteInvite[] }>('/api/admin/site-invites'),
  create: (body: { label: string; maxUses: number | null; expiresInDays: number | null }) => apiPost<{ invite: SiteInvite }>('/api/admin/site-invites', body),
  revoke: (id: string) => apiDelete(`/api/admin/site-invites/${id}`),
  /** Whether a pasted code would let a new account be created. */
  check: (code: string) => apiPost<{ valid: boolean }>('/api/auth/invite/check', { code }),
};
