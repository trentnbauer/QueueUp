import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { createXboxProvider } from './xboxProvider.js';

const config = { clientId: 'client-1', redirectUri: 'https://queueup.example.com/auth/xbox/callback' };

function request(query: Record<string, string> = {}, session: Record<string, unknown> = {}): FastifyRequest {
  return { query, session } as unknown as FastifyRequest;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Microsoft token, then Xbox Live user token, then XSTS - the three calls a sign-in makes. */
function fetchFor(xsts: Response) {
  return vi
    .fn()
    .mockResolvedValueOnce(json({ access_token: 'ms-access' }))
    .mockResolvedValueOnce(json({ Token: 'xbl-user' }))
    .mockResolvedValueOnce(xsts) as unknown as typeof fetch;
}

describe('xbox sign-in provider', () => {
  it('builds a PKCE authorize URL and keeps the verifier and state in the session', async () => {
    const session: Record<string, unknown> = {};
    const url = new URL(await createXboxProvider(config).buildAuthUrl(request({}, session)));
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('scope')).toBe('XboxLive.signin');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe(session.authState);
    expect(session.authCodeVerifier).toBeTruthy();
  });

  it('signs in as the xuid, with the gamertag as the name and a made-up email', async () => {
    const fetchImpl = fetchFor(json({ Token: 'xsts', DisplayClaims: { xui: [{ uhs: 'uhs1', xid: '2535400000000001', gtg: 'CoolGamer' }] } }));
    const profile = await createXboxProvider(config, fetchImpl).handleCallback(request({ code: 'abc', state: 's1' }, { authState: 's1', authCodeVerifier: 'v1' }));
    expect(profile).toEqual({
      oidcSub: 'xbox:2535400000000001',
      email: '2535400000000001@xbox.unknown',
      emailVerified: false,
      displayName: 'CoolGamer',
      avatarUrl: null,
    });
    const tokenCall = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = new URLSearchParams(tokenCall[1].body as string);
    expect(body.get('code_verifier')).toBe('v1');
    expect(body.has('client_secret')).toBe(false);
  });

  it('sends the client secret when the app has one', async () => {
    const fetchImpl = fetchFor(json({ Token: 'x', DisplayClaims: { xui: [{ uhs: 'u', xid: '1' }] } }));
    const profile = await createXboxProvider({ ...config, clientSecret: 'sec' }, fetchImpl).handleCallback(request({ code: 'abc', state: 's' }, { authState: 's' }));
    expect(new URLSearchParams((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string).get('client_secret')).toBe('sec');
    expect(profile.displayName).toBe('Xbox 1');
  });

  it('rejects a mismatched state, a refusal and a missing code before calling Microsoft', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const p = createXboxProvider(config, fetchImpl);
    await expect(p.handleCallback(request({ code: 'c', state: 'x' }, { authState: 'y' }))).rejects.toThrow(/state mismatch/);
    await expect(p.handleCallback(request({ state: 'y', error: 'access_denied' }, { authState: 'y' }))).rejects.toThrow(/cancelled/);
    await expect(p.handleCallback(request({ state: 'y' }, { authState: 'y' }))).rejects.toThrow(/authorization code/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes on a clear message when Xbox Live refuses the account', async () => {
    const fetchImpl = fetchFor(json({ XErr: 2148916233 }, 401));
    await expect(createXboxProvider(config, fetchImpl).handleCallback(request({ code: 'c', state: 's' }, { authState: 's' }))).rejects.toThrow(/no Xbox profile/);
  });

  it('fails when the Microsoft token exchange fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400)) as unknown as typeof fetch;
    await expect(createXboxProvider(config, fetchImpl).handleCallback(request({ code: 'c', state: 's' }, { authState: 's' }))).rejects.toThrow(/token exchange failed \(400\)/);
  });
});
