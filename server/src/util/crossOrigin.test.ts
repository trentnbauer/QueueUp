import { describe, it, expect } from 'vitest';
import { isCrossOriginWrite } from './crossOrigin.js';

const APP = 'https://queueup.example.com';
const V1 = '/api/v1/';
const check = (method: string, origin: string | undefined, url = '/api/rooms') => isCrossOriginWrite(method, origin, url, APP, V1);

describe('isCrossOriginWrite', () => {
  it('refuses a state-changing request from a sibling subdomain', () => {
    expect(check('POST', 'https://evil.example.com')).toBe(true);
    expect(check('DELETE', 'https://evil.example.com', '/api/me')).toBe(true);
  });

  it('refuses an opaque ("null") origin', () => {
    expect(check('POST', 'null')).toBe(true);
  });

  it('allows the app itself, reads, and clients that send no Origin', () => {
    expect(check('POST', APP)).toBe(false);
    expect(check('GET', 'https://evil.example.com')).toBe(false);
    expect(check('POST', undefined)).toBe(false);
  });

  it('leaves the bearer-token API alone', () => {
    expect(check('POST', 'https://evil.example.com', '/api/v1/library/games')).toBe(false);
  });
});
