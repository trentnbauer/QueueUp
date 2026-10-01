import type { FastifyRequest } from 'fastify';
import * as client from 'openid-client';
import type { AuthProvider, OAuthProfile } from './types.js';

interface OidcProviderConfig {
  name: string;
  subPrefix: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

/** Builds a provider for anything that's genuinely OIDC-compliant with discovery (generic custom
 * issuer, Google). Discord is NOT this shape (no discovery, no id_token) - see discordProvider.ts. */
export async function createOidcProvider(config: OidcProviderConfig): Promise<AuthProvider> {
  const configuration = await client.discovery(new URL(config.issuerUrl), config.clientId, config.clientSecret);

  return {
    name: config.name,

    async buildAuthUrl(request: FastifyRequest) {
      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();

      request.session.authCodeVerifier = codeVerifier;
      request.session.authState = state;

      const authUrl = client.buildAuthorizationUrl(configuration, {
        redirect_uri: config.redirectUri,
        scope: config.scopes,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      });
      return authUrl.href;
    },

    async handleCallback(request: FastifyRequest): Promise<OAuthProfile> {
      const callbackUrl = new URL(config.redirectUri);
      callbackUrl.search = request.url.split('?')[1] ?? '';

      const tokens = await client.authorizationCodeGrant(configuration, callbackUrl, {
        pkceCodeVerifier: request.session.authCodeVerifier,
        expectedState: request.session.authState,
      });

      const claims = tokens.claims();
      if (!claims?.sub) {
        throw new Error(`${config.name} did not return a subject claim`);
      }

      let email = typeof claims.email === 'string' ? claims.email : null;
      let emailVerifiedClaim: unknown = email ? claims.email_verified : undefined;
      let name = typeof claims.name === 'string' ? claims.name : null;
      let picture = typeof claims.picture === 'string' ? claims.picture : null;
      if (!email || !name || !picture) {
        const userInfo = await client.fetchUserInfo(configuration, tokens.access_token, claims.sub);
        if (!email && typeof userInfo.email === 'string') emailVerifiedClaim = userInfo.email_verified;
        email = email ?? (typeof userInfo.email === 'string' ? userInfo.email : `${claims.sub}@${config.name}.unknown`);
        name = name ?? (typeof userInfo.name === 'string' ? userInfo.name : claims.sub);
        picture = picture ?? (typeof userInfo.picture === 'string' ? userInfo.picture : null);
      }

      return {
        oidcSub: `${config.subPrefix}:${claims.sub}`,
        email,
        // Only an explicit `email_verified: false` counts against it. Google always sends the claim;
        // a self-hosted IdP (the generic OIDC option) often leaves it out entirely, and that IdP is
        // the instance owner's own, so its addresses are trusted unless it says otherwise.
        emailVerified: !email.endsWith(`@${config.name}.unknown`) && emailVerifiedClaim !== false && emailVerifiedClaim !== 'false',
        displayName: name,
        avatarUrl: picture,
      };
    },
  };
}
