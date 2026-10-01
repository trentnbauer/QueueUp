import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.js', () => ({ env: {} }));
vi.mock('./configResolver.js', () => ({ getConfigValue: vi.fn() }));

const { verifyTurnstileToken } = await import('./turnstile.js');

function fakeFetch(response: { ok?: boolean; json?: unknown } | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return { ok: response.ok ?? true, json: async () => response.json } as Response;
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('verifyTurnstileToken', () => {
  it('accepts a token Cloudflare says is valid, sending the secret, token and IP', async () => {
    const fetchImpl = fakeFetch({ json: { success: true } });
    expect(await verifyTurnstileToken('secret', 'tok', '1.2.3.4', fetchImpl)).toBe(true);
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect(body.get('secret')).toBe('secret');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('rejects a token Cloudflare says is invalid', async () => {
    expect(await verifyTurnstileToken('secret', 'tok', undefined, fakeFetch({ json: { success: false } }))).toBe(false);
  });

  it('fails closed when the token is missing or Cloudflare is unreachable', async () => {
    const fetchImpl = fakeFetch({ json: { success: true } });
    expect(await verifyTurnstileToken('secret', undefined, undefined, fetchImpl)).toBe(false);
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect(await verifyTurnstileToken('secret', 'tok', undefined, fakeFetch(new Error('down')))).toBe(false);
    expect(await verifyTurnstileToken('secret', 'tok', undefined, fakeFetch({ ok: false, json: {} }))).toBe(false);
  });
});
