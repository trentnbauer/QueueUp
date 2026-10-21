import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { parseQueryString } from './queryString.js';

describe('parseQueryString', () => {
  it('reads plain keys, decoding as the default parser did', () => {
    expect(parseQueryString('q=zelda%20bow&sort=name&flag=')).toEqual({ q: 'zelda bow', sort: 'name', flag: '' });
    expect(parseQueryString('openid.mode=id_res&openid.claimed_id=https%3A%2F%2Fx')).toEqual({ 'openid.mode': 'id_res', 'openid.claimed_id': 'https://x' });
    expect(parseQueryString('')).toEqual({});
  });

  it('keeps the last of a repeated key, so a value is never an array', () => {
    expect(parseQueryString('q=a&q=b&q=c')).toEqual({ q: 'c' });
  });

  it('makes a key like __proto__ an ordinary own property', () => {
    const parsed = parseQueryString('__proto__=x&constructor=y');
    expect(Object.keys(parsed)).toEqual(['__proto__', 'constructor']);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });

  it('lets a route read it as a string when Fastify is given it', async () => {
    const app = Fastify({ querystringParser: parseQueryString });
    app.get('/search', async (request) => ({ q: (request.query as { q?: string }).q?.trim() }));
    const res = await app.inject({ method: 'GET', url: '/search?q=a&q=%20b%20' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ q: 'b' });
    await app.close();
  });
});
