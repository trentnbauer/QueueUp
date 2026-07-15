import type { FastifyRequest } from 'fastify';
import type { AuthProvider, OAuthProfile } from './types.js';

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const CLAIMED_ID_RE = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

interface SteamConfig {
  apiKey: string;
  redirectUri: string;
}

interface SteamPlayerSummary {
  personaname: string;
  avatarfull: string;
}

// Steam only supports legacy OpenID 2.0, a completely different (and older) protocol from
// OAuth2/OIDC despite the similar name - openid-client (which is OIDC-only) can't talk to it.
// The handshake: redirect to Steam, Steam redirects back with a signed assertion in the query
// string, and we must POST those exact params back to Steam with mode=check_authentication to
// verify the signature before trusting anything in them. Skipping that verification step would
// let anyone forge a login as any SteamID by hand-crafting the callback query string.
export function createSteamProvider(config: SteamConfig): AuthProvider {
  const realm = new URL(config.redirectUri).origin;

  return {
    name: 'steam',

    async buildAuthUrl() {
      const url = new URL(STEAM_OPENID_URL);
      url.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
      url.searchParams.set('openid.mode', 'checkid_setup');
      url.searchParams.set('openid.return_to', config.redirectUri);
      url.searchParams.set('openid.realm', realm);
      url.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
      url.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');
      return url.href;
    },

    async handleCallback(request: FastifyRequest): Promise<OAuthProfile> {
      const query = request.query as Record<string, string | undefined>;

      if (query['openid.mode'] !== 'id_res') {
        throw new Error('Steam sign-in was not completed');
      }

      const verifyParams = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (key.startsWith('openid.') && value !== undefined) verifyParams.set(key, value);
      }
      verifyParams.set('openid.mode', 'check_authentication');

      const verifyResponse = await fetch(STEAM_OPENID_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verifyParams,
      });
      if (!verifyResponse.ok) {
        throw new Error(`Steam verification request failed (${verifyResponse.status})`);
      }
      const verifyBody = await verifyResponse.text();
      if (!/is_valid\s*:\s*true/.test(verifyBody)) {
        throw new Error('Steam could not verify this sign-in — it may have been tampered with');
      }

      const claimedId = query['openid.claimed_id'];
      const match = claimedId ? CLAIMED_ID_RE.exec(claimedId) : null;
      if (!match) {
        throw new Error('Steam did not return a valid SteamID');
      }
      const steamId64 = match[1];

      let displayName = steamId64;
      let avatarUrl: string | null = null;
      try {
        const summaryUrl = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/');
        summaryUrl.searchParams.set('key', config.apiKey);
        summaryUrl.searchParams.set('steamids', steamId64);
        const summaryResponse = await fetch(summaryUrl);
        if (summaryResponse.ok) {
          const body = (await summaryResponse.json()) as { response?: { players?: SteamPlayerSummary[] } };
          const player = body.response?.players?.[0];
          if (player) {
            displayName = player.personaname;
            avatarUrl = player.avatarfull;
          }
        }
      } catch {
        // Steam Web API hiccup shouldn't block sign-in — fall back to the bare SteamID as the name.
      }

      // Steam doesn't provide an email at all.
      return {
        oidcSub: `steam:${steamId64}`,
        email: `${steamId64}@steamcommunity.unknown`,
        displayName,
        avatarUrl,
      };
    },
  };
}
