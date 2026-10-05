import { describe, expect, it, vi } from 'vitest';
import { getXboxSession, pollDeviceCode, refreshMicrosoftToken, sessionFromRefreshToken, startDeviceCode, XboxAuthError, xstsErrorMessage } from './xboxAuth.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const asFetch = (fn: unknown) => fn as unknown as typeof fetch;

/** A fetch that answers each call with the next response in order, and records what was asked. */
function sequence(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next;
  });
  return { impl: asFetch(impl), calls };
}

describe('startDeviceCode', () => {
  it('asks Microsoft for a code with the Xbox scope', async () => {
    const { impl, calls } = sequence(json({ device_code: 'dc', user_code: 'ABCD1234', verification_uri: 'https://www.microsoft.com/link', expires_in: 900, interval: 5 }));
    const code = await startDeviceCode('client-1', impl);
    expect(code).toEqual({ deviceCode: 'dc', userCode: 'ABCD1234', verificationUri: 'https://www.microsoft.com/link', expiresIn: 900, interval: 5 });
    expect(calls[0].url).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode');
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(form.get('client_id')).toBe('client-1');
    expect(form.get('scope')).toBe('XboxLive.signin offline_access');
  });

  it('explains a rejected client id', async () => {
    const { impl } = sequence(json({ error: 'invalid_request', error_description: 'AADSTS700016: Application not found' }, 400));
    await expect(startDeviceCode('bad', impl)).rejects.toThrow(/client ID/);
  });
});

describe('pollDeviceCode', () => {
  it('returns the tokens once approved', async () => {
    const { impl, calls } = sequence(json({ access_token: 'at', refresh_token: 'rt' }));
    expect(await pollDeviceCode('c', 'dc', impl)).toEqual({ status: 'connected', accessToken: 'at', refreshToken: 'rt' });
    expect(new URLSearchParams(String(calls[0].init.body)).get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
  });

  it.each([
    [{ error: 'authorization_pending' }, { status: 'pending' }],
    [{ error: 'slow_down' }, { status: 'pending', slowDown: true }],
    [{ error: 'authorization_declined' }, { status: 'declined' }],
    [{ error: 'expired_token' }, { status: 'expired' }],
  ])('maps %o', async (body, expected) => {
    const { impl } = sequence(json(body, 400));
    expect(await pollDeviceCode('c', 'dc', impl)).toEqual(expected);
  });

  it('fails on an answer it does not know', async () => {
    const { impl } = sequence(json({ error: 'server_error' }, 500));
    await expect(pollDeviceCode('c', 'dc', impl)).rejects.toThrow(XboxAuthError);
  });
});

describe('refreshMicrosoftToken', () => {
  it('keeps the rotated refresh token', async () => {
    const { impl } = sequence(json({ access_token: 'at2', refresh_token: 'rt2' }));
    expect(await refreshMicrosoftToken('c', 'rt1', impl)).toEqual({ accessToken: 'at2', refreshToken: 'rt2' });
  });

  it('keeps the old one when none comes back', async () => {
    const { impl } = sequence(json({ access_token: 'at2' }));
    expect(await refreshMicrosoftToken('c', 'rt1', impl)).toEqual({ accessToken: 'at2', refreshToken: 'rt1' });
  });

  it('asks the person to link again when the login lapsed', async () => {
    const { impl } = sequence(json({ error: 'invalid_grant' }, 400));
    const err = await refreshMicrosoftToken('c', 'rt1', impl).catch((e) => e);
    expect(err).toBeInstanceOf(XboxAuthError);
    expect(err.needsRelink).toBe(true);
  });

  it('treats a passing failure as retryable, not a relink', async () => {
    const { impl } = sequence(json({ error: 'temporarily_unavailable' }, 503));
    const err = await refreshMicrosoftToken('c', 'rt1', impl).catch((e) => e);
    expect(err.needsRelink).toBe(false);
  });
});

describe('getXboxSession', () => {
  const xblOk = () => json({ Token: 'xbl-token', DisplayClaims: { xui: [{ uhs: 'uhs-1' }] } });
  const xstsOk = () => json({ Token: 'xsts-token', DisplayClaims: { xui: [{ uhs: 'uhs-1', xid: '2533274', gtg: 'Player One' }] } });

  it('exchanges the Microsoft token for an Xbox session', async () => {
    const { impl, calls } = sequence(xblOk(), xstsOk());
    const session = await getXboxSession('ms-access', 'rt', impl);
    expect(session).toEqual({ authorization: 'XBL3.0 x=uhs-1;xsts-token', xuid: '2533274', gamertag: 'Player One', refreshToken: 'rt' });
    expect(JSON.parse(String(calls[0].init.body)).Properties.RpsTicket).toBe('d=ms-access');
    expect(JSON.parse(String(calls[1].init.body)).Properties.UserTokens).toEqual(['xbl-token']);
  });

  it('explains why Xbox Live refused an account', async () => {
    const { impl } = sequence(xblOk(), json({ XErr: 2148916238 }, 401));
    await expect(getXboxSession('a', 'r', impl)).rejects.toThrow(/child account/);
  });

  it('fails when Xbox Live does not say who the account is', async () => {
    const { impl } = sequence(xblOk(), json({ Token: 'x', DisplayClaims: { xui: [{}] } }));
    await expect(getXboxSession('a', 'r', impl)).rejects.toThrow(/who this account is/);
  });

  it('fails when the first Xbox Live step is refused', async () => {
    const { impl } = sequence(json({}, 401));
    await expect(getXboxSession('a', 'r', impl)).rejects.toThrow(XboxAuthError);
  });
});

describe('sessionFromRefreshToken', () => {
  it('refreshes at Microsoft, then signs in to Xbox Live, returning the rotated token', async () => {
    const { impl } = sequence(
      json({ access_token: 'at', refresh_token: 'rt-new' }),
      json({ Token: 't', DisplayClaims: { xui: [{ uhs: 'u' }] } }),
      json({ Token: 's', DisplayClaims: { xui: [{ uhs: 'u', xid: '1' }] } }),
    );
    const session = await sessionFromRefreshToken('c', 'rt-old', impl);
    expect(session.refreshToken).toBe('rt-new');
    expect(session.gamertag).toBeNull();
  });
});

describe('xstsErrorMessage', () => {
  it('has a friendly line for the known codes and a fallback', () => {
    expect(xstsErrorMessage(2148916233)).toMatch(/no Xbox profile/);
    expect(xstsErrorMessage(2148916235)).toMatch(/country or region/);
    expect(xstsErrorMessage(1)).toMatch(/would not let/);
  });
});
