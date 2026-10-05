import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/redisClient.js', () => ({ redis: {} }));

import { sessionCookieSecure } from './session.js';

describe('sessionCookieSecure', () => {
  const https = 'https://queueup.example.com';

  it('forces Secure in production with an https APP_BASE_URL', () => {
    expect(sessionCookieSecure({ nodeEnv: 'production', appBaseUrl: https, allowInsecure: false })).toBe(true);
    expect(sessionCookieSecure({ nodeEnv: 'production', appBaseUrl: 'HTTPS://Example.com', allowInsecure: false })).toBe(true);
  });

  it('follows the request protocol for an http APP_BASE_URL or outside production', () => {
    expect(sessionCookieSecure({ nodeEnv: 'production', appBaseUrl: 'http://192.168.1.5:3000', allowInsecure: false })).toBe('auto');
    expect(sessionCookieSecure({ nodeEnv: 'development', appBaseUrl: https, allowInsecure: false })).toBe('auto');
    expect(sessionCookieSecure({ nodeEnv: undefined, appBaseUrl: https, allowInsecure: false })).toBe('auto');
  });

  it('honours the explicit opt-out', () => {
    expect(sessionCookieSecure({ nodeEnv: 'production', appBaseUrl: https, allowInsecure: true })).toBe('auto');
  });
});
