import type { FastifyRequest } from 'fastify';

export interface OAuthProfile {
  oidcSub: string;
  email: string;
  /** Whether the provider vouches that `email` belongs to this account. Only a verified email can
   * match ADMIN_EMAILS (see computeIsAdmin) - otherwise anyone could set an admin's address as an
   * unverified email on their own Discord/OIDC account and sign in as an administrator. */
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthProvider {
  name: string;
  buildAuthUrl(request: FastifyRequest): Promise<string>;
  handleCallback(request: FastifyRequest): Promise<OAuthProfile>;
}
