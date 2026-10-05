/** Signs in to PlayStation Network from a server with no browser. The person gives a one-off NPSSO
 * code (the value of Sony's sign-in cookie, see the setup dialog); QueueUp trades it for an access
 * token and a long-lived refresh token, keeps only the refresh token, and uses it for later syncs.
 *
 * Sony has no official API for this. The flow and the values below (the mobile app's client id and
 * its public client credential) are the same ones the open-source `psn-api` package
 * (https://github.com/achievements-app/psn-api, MIT licence) uses, re-implemented here over plain
 * `fetch` with an injectable fetch so it tests without a network. They can change without notice.
 *
 *   1. NPSSO cookie  ->  access code   ca.account.sony.com/.../authorize  (a redirect carrying ?code=)
 *   2. access code   ->  tokens        ca.account.sony.com/.../token
 *   3. refresh token ->  new tokens    the same token endpoint, on later syncs */

const AUTH_BASE_URL = 'https://ca.account.sony.com/api/authz/v3/oauth';
const CLIENT_ID = '09515159-7237-4370-9b40-3806e67c0891';
const REDIRECT_URI = 'com.scee.psxandroid.scecompcall://redirect';
const SCOPE = 'psn:mobile.v2.core psn:clientapp';
// The mobile app's public client credential (client id and secret, base64), as published by psn-api.
const BASIC_AUTH = 'Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
const REQUEST_TIMEOUT_MS = 20_000;

export class PsnAuthError extends Error {
  constructor(
    message: string,
    /** Whether the person has to link again (a bad, expired or revoked login), as opposed to a
     * passing failure worth retrying. */
    readonly needsRelink = false,
  ) {
    super(message);
    this.name = 'PsnAuthError';
  }
}

export interface PsnTokens {
  accessToken: string;
  refreshToken: string;
  /** When the refresh token stops working, if Sony said. */
  refreshExpiresAt: Date | null;
}

type Fetch = typeof fetch;

/** An NPSSO is 64 letters and digits. Checking the shape first spares a pointless request on a typo. */
export function isValidNpsso(value: string): boolean {
  return /^[A-Za-z0-9]{64}$/.test(value);
}

function tokensFrom(raw: Record<string, any>, now: Date): PsnTokens | null {
  if (typeof raw.access_token !== 'string' || typeof raw.refresh_token !== 'string') return null;
  const seconds = Number(raw.refresh_token_expires_in);
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    refreshExpiresAt: Number.isFinite(seconds) && seconds > 0 ? new Date(now.getTime() + seconds * 1000) : null,
  };
}

async function postTokenRequest(form: Record<string, string>, fetchImpl: Fetch): Promise<{ status: number; body: Record<string, any> }> {
  let res: Response;
  try {
    res = await fetchImpl(`${AUTH_BASE_URL}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: BASIC_AUTH },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PsnAuthError('Could not reach PlayStation. Try again in a moment.');
  }
  return { status: res.status, body: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, any> };
}

/** Steps 1 and 2: trades a fresh NPSSO for tokens. Throws a "link again" error when Sony does not
 * accept it (mistyped, expired, or signed out since). */
export async function exchangeNpsso(npsso: string, fetchImpl: Fetch = fetch, now: Date = new Date()): Promise<PsnTokens> {
  const query = new URLSearchParams({ access_type: 'offline', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPE });
  let res: Response;
  try {
    // Sony answers with a redirect that carries the code, never a 200 - so the redirect must not be followed.
    res = await fetchImpl(`${AUTH_BASE_URL}/authorize?${query.toString()}`, {
      headers: { cookie: `npsso=${npsso}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new PsnAuthError('Could not reach PlayStation. Try again in a moment.');
  }
  const code = res.headers.get('location')?.match(/[?&]code=([^&]+)/)?.[1];
  if (!code) {
    throw new PsnAuthError('PlayStation did not accept that code. Make sure you are signed in at playstation.com, then copy a fresh one.', true);
  }

  const { status, body } = await postTokenRequest(
    { code: decodeURIComponent(code), redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', token_format: 'jwt' },
    fetchImpl,
  );
  const tokens = status === 200 ? tokensFrom(body, now) : null;
  if (!tokens) throw new PsnAuthError('PlayStation would not finish signing in. Try again with a fresh code.', true);
  return tokens;
}

/** Step 3: a fresh access token (and a rotated refresh token) from a stored refresh token. */
export async function refreshTokens(refreshToken: string, fetchImpl: Fetch = fetch, now: Date = new Date()): Promise<PsnTokens> {
  const { status, body } = await postTokenRequest(
    { refresh_token: refreshToken, grant_type: 'refresh_token', token_format: 'jwt', scope: SCOPE },
    fetchImpl,
  );
  const tokens = status === 200 ? tokensFrom(body, now) : null;
  if (tokens) return tokens;
  // A 400-level answer means the login lapsed (about 60 days) or was signed out; a 5xx is Sony's problem.
  if (status >= 400 && status < 500) throw new PsnAuthError('Your PlayStation link has expired. Link your PlayStation account again.', true);
  throw new PsnAuthError('PlayStation is having problems right now. Try again later.');
}
