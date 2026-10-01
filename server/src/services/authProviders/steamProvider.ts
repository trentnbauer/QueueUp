import type { FastifyRequest } from 'fastify';
import * as client from 'openid-client';
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

/** Rejects a callback that wasn't started by this browser session (see buildAuthUrl), or whose
 * signed fields don't cover what we go on to trust. check_authentication only proves Steam signed
 * the fields listed in openid.signed, so claimed_id and return_to must be among them - otherwise a
 * caller could submit a valid signature over some other subset alongside an unsigned claimed_id. */
export function assertSteamCallbackBoundToSession(
  query: Record<string, string | undefined>,
  sessionState: string | undefined,
  redirectUri: string,
): void {
  const state = query.state;
  if (!sessionState || !state || state !== sessionState) {
    throw new Error('Steam sign-in state mismatch — please try again');
  }

  const returnTo = query['openid.return_to'];
  let returnToUrl: URL;
  try {
    returnToUrl = new URL(returnTo ?? '');
  } catch {
    throw new Error('Steam sign-in returned to an unexpected address');
  }
  const expected = new URL(redirectUri);
  if (
    returnToUrl.origin !== expected.origin ||
    returnToUrl.pathname !== expected.pathname ||
    returnToUrl.searchParams.get('state') !== sessionState
  ) {
    throw new Error('Steam sign-in returned to an unexpected address');
  }

  const signed = new Set((query['openid.signed'] ?? '').split(','));
  if (!signed.has('claimed_id') || !signed.has('return_to')) {
    throw new Error('Steam did not sign this sign-in');
  }
  if (query['openid.op_endpoint'] !== STEAM_OPENID_URL) {
    throw new Error('Steam sign-in came from an unexpected provider');
  }
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

    async buildAuthUrl(request: FastifyRequest) {
      // OpenID 2.0 has no `state` parameter of its own, so without this nothing ties a callback to
      // the browser session that started it: anyone could replay their *own* freshly-signed Steam
      // assertion into someone else's browser (two top-level navigations from a page they control
      // - the first to /auth/steam/link, the second to the callback) and attach their SteamID to
      // that victim's account, then sign in as the victim with Steam. A per-attempt value in
      // return_to (which Steam signs, so it can't be swapped) closes that, same job as `state`
      // does for the OAuth providers.
      const state = client.randomState();
      request.session.authState = state;
      const returnTo = new URL(config.redirectUri);
      returnTo.searchParams.set('state', state);

      const url = new URL(STEAM_OPENID_URL);
      url.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
      url.searchParams.set('openid.mode', 'checkid_setup');
      url.searchParams.set('openid.return_to', returnTo.href);
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
      assertSteamCallbackBoundToSession(query, request.session.authState, config.redirectUri);

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
        emailVerified: false,
        displayName,
        avatarUrl,
      };
    },
  };
}
