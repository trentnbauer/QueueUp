import type { FastifyRequest } from 'fastify';

export interface OAuthProfile {
  oidcSub: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthProvider {
  name: string;
  buildAuthUrl(request: FastifyRequest): Promise<string>;
  handleCallback(request: FastifyRequest): Promise<OAuthProfile>;
}
