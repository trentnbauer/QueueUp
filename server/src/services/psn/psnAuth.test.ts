import { describe, expect, it, vi } from 'vitest';
import { exchangeNpsso, isValidNpsso, PsnAuthError, refreshTokens } from './psnAuth.js';

const NPSSO = 'a'.repeat(64);
const NOW = new Date('2026-10-05T00:00:00Z');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const asFetch = (fn: unknown) => fn as unknown as typeof fetch;
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const tokenReply = () => json({ access_token: 'at', refresh_token: 'rt', refresh_token_expires_in: 5184000 });

/** A fetch that answers each call with the next response, recording what was asked. */
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

describe('isValidNpsso', () => {
  it('wants exactly 64 letters and digits', () => {
    expect(isValidNpsso(NPSSO)).toBe(true);
    expect(isValidNpsso('a'.repeat(63))).toBe(false);
    expect(isValidNpsso('a'.repeat(65))).toBe(false);
    expect(isValidNpsso(`${'a'.repeat(63)}!`)).toBe(false);
    expect(isValidNpsso('')).toBe(false);
  });
});

describe('exchangeNpsso', () => {
  it('trades the NPSSO for an access code, then for tokens', async () => {
    const { impl, calls } = sequence(redirect('com.scee.psxandroid.scecompcall://redirect/?code=v3.abc123&cid=x'), tokenReply());
    const tokens = await exchangeNpsso(NPSSO, impl, NOW);
    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', refreshExpiresAt: new Date('2026-12-04T00:00:00Z') });

    // Step 1 sends the NPSSO as a cookie and must not follow the redirect.
    expect(calls[0].url).toContain('https://ca.account.sony.com/api/authz/v3/oauth/authorize?');
    expect((calls[0].init.headers as Record<string, string>).cookie).toBe(`npsso=${NPSSO}`);
    expect(calls[0].init.redirect).toBe('manual');
    // Step 2 sends the code to the token endpoint.
    expect(calls[1].url).toBe('https://ca.account.sony.com/api/authz/v3/oauth/token');
    const form = new URLSearchParams(String(calls[1].init.body));
    expect(form.get('code')).toBe('v3.abc123');
    expect(form.get('grant_type')).toBe('authorization_code');
  });

  it('asks for a fresh code when Sony does not hand back an access code', async () => {
    const { impl } = sequence(redirect('https://my.account.sony.com/sonyacct/signin'));
    const err = await exchangeNpsso(NPSSO, impl, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(PsnAuthError);
    expect(err.needsRelink).toBe(true);
    expect(err.message).toMatch(/fresh one/);
  });

  it('fails when the token step is refused', async () => {
    const { impl } = sequence(redirect('com.scee.psxandroid.scecompcall://redirect/?code=v3.abc'), json({ error: 'invalid_grant' }, 400));
    await expect(exchangeNpsso(NPSSO, impl, NOW)).rejects.toMatchObject({ needsRelink: true });
  });

  it('reports a network failure as retryable', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await exchangeNpsso(NPSSO, asFetch(down), NOW).catch((e) => e);
    expect(err.message).toMatch(/Could not reach/);
    expect(err.needsRelink).toBe(false);
  });

  it('copes with a reply that has no expiry', async () => {
    const { impl } = sequence(redirect('com.scee.psxandroid.scecompcall://redirect/?code=v3.abc'), json({ access_token: 'at', refresh_token: 'rt' }));
    expect((await exchangeNpsso(NPSSO, impl, NOW)).refreshExpiresAt).toBeNull();
  });
});

describe('refreshTokens', () => {
  it('returns rotated tokens', async () => {
    const { impl, calls } = sequence(tokenReply());
    expect(await refreshTokens('old-rt', impl, NOW)).toMatchObject({ accessToken: 'at', refreshToken: 'rt' });
    expect(new URLSearchParams(String(calls[0].init.body)).get('refresh_token')).toBe('old-rt');
    expect(new URLSearchParams(String(calls[0].init.body)).get('grant_type')).toBe('refresh_token');
  });

  it('asks the person to link again when the login lapsed', async () => {
    const { impl } = sequence(json({ error: 'invalid_grant' }, 400));
    await expect(refreshTokens('rt', impl, NOW)).rejects.toMatchObject({ needsRelink: true, message: expect.stringContaining('expired') });
  });

  it('treats a Sony outage as retryable, not a relink', async () => {
    const { impl } = sequence(json({}, 503));
    const err = await refreshTokens('rt', impl, NOW).catch((e) => e);
    expect(err.needsRelink).toBe(false);
    expect(err.message).toMatch(/problems/);
  });
});
