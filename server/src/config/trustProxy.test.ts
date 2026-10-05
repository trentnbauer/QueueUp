import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

// The default TRUST_PROXY must let a real proxy (loopback, Docker network, LAN, the built-in
// tunnel) tell us the visitor's address, while a client that reaches the published port directly
// from the internet cannot choose its own address by sending X-Forwarded-For.
async function clientIpSeenBy(trustProxy: ReturnType<typeof parseTrustProxy>, remoteAddress: string, xff?: string): Promise<string> {
  const app = Fastify({ trustProxy: trustProxy as boolean | string | string[] });
  app.get('/ip', async (request) => request.ip);
  const res = await app.inject({ url: '/ip', remoteAddress, headers: xff ? { 'x-forwarded-for': xff } : {} });
  await app.close();
  return res.body;
}

function parseTrustProxy(value?: string) {
  const parsed = envSchema.shape.TRUST_PROXY.parse(value);
  return parsed;
}

describe('default TRUST_PROXY', () => {
  const trust = parseTrustProxy();

  it('ignores X-Forwarded-For from a client on a public address (cannot spoof its IP)', async () => {
    expect(await clientIpSeenBy(trust, '203.0.113.9', '1.2.3.4')).toBe('203.0.113.9');
    expect(await clientIpSeenBy(trust, '203.0.113.9', '1.2.3.4, 5.6.7.8')).toBe('203.0.113.9');
  });

  it.each(['127.0.0.1', '10.0.0.5', '172.18.0.4', '192.168.1.20'])('takes the visitor address from a proxy at %s', async (proxy) => {
    expect(await clientIpSeenBy(trust, proxy, '198.51.100.7')).toBe('198.51.100.7');
  });

  it('without any header, uses the connecting address', async () => {
    expect(await clientIpSeenBy(trust, '203.0.113.9')).toBe('203.0.113.9');
  });
});
