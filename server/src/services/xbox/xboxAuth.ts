/** Signs in to Xbox Live from a server with no browser: Microsoft's device-code login (the person
 * opens a link on any device and types a short code, so no password ever reaches QueueUp), then the
 * Xbox Live and XSTS token exchange. Everything is plain HTTPS with an injectable `fetch`, so it can
 * be unit-tested without a network. Nothing here knows about users or storage (see xboxConnection.ts).
 *
 * The flow, in order:
 *   1. device code   login.microsoftonline.com  ->  user code + link to show the person
 *   2. poll          login.microsoftonline.com  ->  Microsoft access + refresh token once they approve
 *   3. Xbox Live     user.auth.xboxlive.com     ->  an Xbox Live user token
 *   4. XSTS          xsts.auth.xboxlive.com     ->  the token Xbox services accept, plus their xuid and gamertag
 * The refresh token is what is kept; later syncs go refresh token -> 3 -> 4 without asking again. */

const MS_BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';
const REQUEST_TIMEOUT_MS = 20_000;

export class XboxAuthError extends Error {
  constructor(
    message: string,
    /** Whether the person has to link their account again (an expired or revoked login), as opposed
     * to a passing failure worth retrying. */
    readonly needsRelink = false,
  ) {
    super(message);
    this.name = 'XboxAuthError';
  }
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export type DevicePollResult =
  | { status: 'pending'; /** Microsoft asked us to poll less often. */ slowDown?: boolean }
  | { status: 'expired' | 'declined' }
  | { status: 'connected'; accessToken: string; refreshToken: string };

export interface XboxSession {
  /** `XBL3.0 x=<uhs>;<xsts token>`, ready for an Authorization header. */
  authorization: string;
  xuid: string;
  gamertag: string | null;
  /** The refresh token Microsoft handed back this time (they rotate), to store in place of the old one. */
  refreshToken: string;
}

type Fetch = typeof fetch;

async function postForm(url: string, form: Record<string, string>, fetchImpl: Fetch): Promise<{ status: number; body: Record<string, any> }> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new XboxAuthError('Could not reach Microsoft. Try again in a moment.');
  }
  return { status: res.status, body: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, any> };
}

async function postJson(url: string, body: unknown, contractVersion: string, fetchImpl: Fetch): Promise<{ status: number; body: Record<string, any> }> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-xbl-contract-version': contractVersion },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new XboxAuthError('Could not reach Xbox Live. Try again in a moment.');
  }
  return { status: res.status, body: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, any> };
}

/** Step 1: asks Microsoft for a code the person can type at the link. */
export async function startDeviceCode(clientId: string, fetchImpl: Fetch = fetch): Promise<DeviceCode> {
  const { status, body } = await postForm(`${MS_BASE}/devicecode`, { client_id: clientId, scope: SCOPE }, fetchImpl);
  if (status !== 200 || !body.device_code || !body.user_code) {
    throw new XboxAuthError(
      `Microsoft would not start the Xbox login${typeof body.error_description === 'string' ? ` (${body.error_description.split('\r')[0]})` : ''}. Check the Xbox app's client ID.`,
    );
  }
  return {
    deviceCode: String(body.device_code),
    userCode: String(body.user_code),
    verificationUri: String(body.verification_uri ?? 'https://www.microsoft.com/link'),
    expiresIn: Number(body.expires_in) || 900,
    interval: Number(body.interval) || 5,
  };
}

/** Step 2: asks once whether the person has approved yet. Call again after `interval` seconds while pending. */
export async function pollDeviceCode(clientId: string, deviceCode: string, fetchImpl: Fetch = fetch): Promise<DevicePollResult> {
  const { status, body } = await postForm(
    `${MS_BASE}/token`,
    { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: deviceCode },
    fetchImpl,
  );
  if (status === 200 && body.access_token && body.refresh_token) {
    return { status: 'connected', accessToken: String(body.access_token), refreshToken: String(body.refresh_token) };
  }
  switch (body.error) {
    case 'authorization_pending':
      return { status: 'pending' };
    case 'slow_down':
      return { status: 'pending', slowDown: true };
    case 'authorization_declined':
      return { status: 'declined' };
    case 'expired_token':
    case 'bad_verification_code':
      return { status: 'expired' };
    default:
      throw new XboxAuthError('Microsoft returned an unexpected answer while linking. Try again.');
  }
}

/** Trades a stored refresh token for a fresh Microsoft access token (and a rotated refresh token). */
export async function refreshMicrosoftToken(clientId: string, refreshToken: string, fetchImpl: Fetch = fetch): Promise<{ accessToken: string; refreshToken: string }> {
  const { status, body } = await postForm(
    `${MS_BASE}/token`,
    { grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, scope: SCOPE },
    fetchImpl,
  );
  if (status === 200 && body.access_token) {
    return { accessToken: String(body.access_token), refreshToken: String(body.refresh_token ?? refreshToken) };
  }
  // invalid_grant: the login expired (about 90 days unused), was revoked, or the password changed.
  if (body.error === 'invalid_grant' || body.error === 'interaction_required') {
    throw new XboxAuthError('Your Xbox link has expired. Link your Xbox account again.', true);
  }
  throw new XboxAuthError('Could not refresh the Xbox login. Try again in a moment.');
}

/** Why Xbox Live refuses some accounts (XSTS error codes), in words a person can act on. */
export function xstsErrorMessage(xerr: unknown): string {
  switch (Number(xerr)) {
    case 2148916233:
      return 'This Microsoft account has no Xbox profile yet. Sign in once at xbox.com to create one, then try again.';
    case 2148916235:
      return 'Xbox Live is not available in this account\'s country or region.';
    case 2148916236:
    case 2148916237:
      return 'This account needs an adult verification at xbox.com before it can be linked.';
    case 2148916238:
      return 'This is a child account. Add it to a Microsoft family group and allow it to share Xbox activity, then try again.';
    default:
      return 'Xbox Live would not let this account in.';
  }
}

/** Steps 3 and 4: a Microsoft access token in, an Xbox services session out. */
export async function getXboxSession(accessToken: string, refreshToken: string, fetchImpl: Fetch = fetch): Promise<XboxSession> {
  const user = await postJson(
    'https://user.auth.xboxlive.com/user/authenticate',
    { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${accessToken}` }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' },
    '1',
    fetchImpl,
  );
  if (user.status !== 200 || !user.body.Token) throw new XboxAuthError('Xbox Live would not accept the login. Try again, or link your account again.');

  const xsts = await postJson(
    'https://xsts.auth.xboxlive.com/xsts/authorize',
    { Properties: { UserTokens: [user.body.Token], SandboxId: 'RETAIL' }, RelyingParty: 'http://xboxlive.com', TokenType: 'JWT' },
    '1',
    fetchImpl,
  );
  if (xsts.status !== 200 || !xsts.body.Token) throw new XboxAuthError(xstsErrorMessage(xsts.body.XErr));

  const claims = xsts.body.DisplayClaims?.xui?.[0] as { uhs?: string; xid?: string; gtg?: string } | undefined;
  if (!claims?.uhs || !claims.xid) throw new XboxAuthError('Xbox Live did not say who this account is. Try again.');
  return {
    authorization: `XBL3.0 x=${claims.uhs};${xsts.body.Token}`,
    xuid: claims.xid,
    gamertag: claims.gtg ?? null,
    refreshToken,
  };
}

/** A usable Xbox session from a stored refresh token: refresh at Microsoft, then steps 3 and 4. */
export async function sessionFromRefreshToken(clientId: string, refreshToken: string, fetchImpl: Fetch = fetch): Promise<XboxSession> {
  const tokens = await refreshMicrosoftToken(clientId, refreshToken, fetchImpl);
  return getXboxSession(tokens.accessToken, tokens.refreshToken, fetchImpl);
}
