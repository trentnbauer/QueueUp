import type { FastifyRequest } from 'fastify';
import * as client from 'openid-client';
import type { AuthProvider, OAuthProfile } from './types.js';

const AUTHORIZE_URL = 'https://discord.com/api/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const PROFILE_URL = 'https://discord.com/api/users/@me';

interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface DiscordTokenResponse {
  access_token: string;
}

interface DiscordProfileResponse {
  id: string;
  username: string;
  global_name?: string | null;
  email?: string | null;
  avatar?: string | null;
}

// Discord's OAuth2 implementation has no discovery document and issues no id_token (it isn't
// really OIDC despite superficially resembling it), so this talks to its endpoints directly
// rather than forcing it through openid-client's OIDC-shaped abstractions.
export function createDiscordProvider(config: DiscordConfig): AuthProvider {
  return {
    name: 'discord',

    async buildAuthUrl(request: FastifyRequest) {
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();

      request.session.authCodeVerifier = codeVerifier;
      request.session.authState = state;

      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'identify email');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      return url.href;
    },

    async handleCallback(request: FastifyRequest): Promise<OAuthProfile> {
      const query = request.query as Record<string, string | undefined>;
      const { code, state } = query;

      if (!state || state !== request.session.authState) {
        throw new Error('Discord sign-in state mismatch — please try again');
      }
      if (!code) {
        throw new Error('Discord did not return an authorization code');
      }

      const tokenResponse = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.redirectUri,
          code_verifier: request.session.authCodeVerifier ?? '',
        }),
      });
      if (!tokenResponse.ok) {
        throw new Error(`Discord token exchange failed (${tokenResponse.status})`);
      }
      const tokens = (await tokenResponse.json()) as DiscordTokenResponse;

      const profileResponse = await fetch(PROFILE_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!profileResponse.ok) {
        throw new Error(`Discord profile fetch failed (${profileResponse.status})`);
      }
      const profile = (await profileResponse.json()) as DiscordProfileResponse;

      return {
        oidcSub: `discord:${profile.id}`,
        email: profile.email ?? `${profile.id}@discord.unknown`,
        displayName: profile.global_name ?? profile.username,
        avatarUrl: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
      };
    },
  };
}
