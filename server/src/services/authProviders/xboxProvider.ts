import type { FastifyRequest } from 'fastify';
import * as client from 'openid-client';
import { getXboxSession, MS_BASE, XboxAuthError } from '../xbox/xboxAuth.js';
import type { AuthProvider, OAuthProfile } from './types.js';

interface XboxConfig {
  clientId: string;
  /** Only for an app registered as a "Web" platform. A public client signs in with PKCE alone. */
  clientSecret?: string;
  redirectUri: string;
}

/** Sign in with Xbox (issue #845). Microsoft's normal redirect login (authorization code with PKCE)
 * against the same Microsoft app the Xbox library sync uses, then the Xbox Live and XSTS exchange
 * (see xbox/xboxAuth.ts) to learn who the person is. The identity is their Xbox user id (xuid), which
 * never changes; the gamertag only names the account. A redirect login, not the device-code one the
 * sync uses, so a stranger cannot hand someone a code to approve and be signed in as them. Xbox gives
 * no email, so one is made up under xbox.unknown (see SYNTHETIC_EMAIL_DOMAINS). Nothing is stored
 * about the Microsoft login: this only proves who they are. */
export function createXboxProvider(config: XboxConfig, fetchImpl: typeof fetch = fetch): AuthProvider {
  return {
    name: 'xbox',

    async buildAuthUrl(request: FastifyRequest) {
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();

      request.session.authCodeVerifier = codeVerifier;
      request.session.authState = state;

      const url = new URL(`${MS_BASE}/authorize`);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'XboxLive.signin');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      return url.href;
    },

    async handleCallback(request: FastifyRequest): Promise<OAuthProfile> {
      const { code, state, error } = request.query as Record<string, string | undefined>;

      if (!state || state !== request.session.authState) {
        throw new Error('Xbox sign-in state mismatch — please try again');
      }
      if (error) {
        throw new Error('Xbox sign-in was cancelled or refused');
      }
      if (!code) {
        throw new Error('Microsoft did not return an authorization code');
      }

      const form: Record<string, string> = {
        client_id: config.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        code_verifier: request.session.authCodeVerifier ?? '',
        scope: 'XboxLive.signin',
      };
      if (config.clientSecret) form.client_secret = config.clientSecret;

      const tokenResponse = await fetchImpl(`${MS_BASE}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(20_000),
      });
      if (!tokenResponse.ok) {
        throw new Error(`Microsoft token exchange failed (${tokenResponse.status})`);
      }
      const tokens = (await tokenResponse.json()) as { access_token?: string };
      if (!tokens.access_token) throw new Error('Microsoft did not return an access token');

      let session;
      try {
        session = await getXboxSession(tokens.access_token, '', fetchImpl);
      } catch (err) {
        // Its messages are written for people ("no Xbox profile yet", child account...), so keep them.
        if (err instanceof XboxAuthError) throw new Error(err.message);
        throw err;
      }

      return {
        oidcSub: `xbox:${session.xuid}`,
        email: `${session.xuid}@xbox.unknown`,
        emailVerified: false,
        displayName: session.gamertag ?? `Xbox ${session.xuid.slice(-4)}`,
        avatarUrl: null,
      };
    },
  };
}
