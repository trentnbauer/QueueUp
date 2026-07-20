import { describe, it, expect } from 'vitest';
import { deriveRedirectUris, type Env } from './env.js';

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 3000,
    APP_BASE_URL: 'https://queueup.example.com',
    DATABASE_URL: 'postgresql://localhost/db',
    REDIS_URL: 'redis://localhost',
    SESSION_SECRET: 'test-secret-test-secret-test-secret',
    TRUST_PROXY: true,
    DEV_FAKE_AUTH: false,
    OIDC_ISSUER_URL: undefined,
    OIDC_CLIENT_ID: undefined,
    OIDC_CLIENT_SECRET: undefined,
    OIDC_REDIRECT_URI: undefined,
    OIDC_SCOPES: 'openid profile email',
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    GOOGLE_REDIRECT_URI: undefined,
    DISCORD_CLIENT_ID: undefined,
    DISCORD_CLIENT_SECRET: undefined,
    DISCORD_REDIRECT_URI: undefined,
    STEAM_API_KEY: undefined,
    STEAM_REDIRECT_URI: undefined,
    GGDEALS_API_KEY: undefined,
    GGDEALS_DEFAULT_REGION: 'us',
    IGDB_CLIENT_ID: undefined,
    IGDB_CLIENT_SECRET: undefined,
    ADMIN_EMAILS: '',
    ...overrides,
  };
}

describe('deriveRedirectUris', () => {
  it('derives every unset *_REDIRECT_URI from APP_BASE_URL', () => {
    const result = deriveRedirectUris(baseEnv());
    expect(result.OIDC_REDIRECT_URI).toBe('https://queueup.example.com/auth/oidc/callback');
    expect(result.GOOGLE_REDIRECT_URI).toBe('https://queueup.example.com/auth/google/callback');
    expect(result.DISCORD_REDIRECT_URI).toBe('https://queueup.example.com/auth/discord/callback');
    expect(result.STEAM_REDIRECT_URI).toBe('https://queueup.example.com/auth/steam/callback');
  });

  it('strips a trailing slash from APP_BASE_URL before appending the callback path', () => {
    const result = deriveRedirectUris(baseEnv({ APP_BASE_URL: 'https://queueup.example.com/' }));
    expect(result.DISCORD_REDIRECT_URI).toBe('https://queueup.example.com/auth/discord/callback');
  });

  it('leaves an explicitly-set *_REDIRECT_URI untouched', () => {
    const result = deriveRedirectUris(baseEnv({ DISCORD_REDIRECT_URI: 'https://other-host.example.com/callback' }));
    expect(result.DISCORD_REDIRECT_URI).toBe('https://other-host.example.com/callback');
    // Unset ones are still derived independently.
    expect(result.GOOGLE_REDIRECT_URI).toBe('https://queueup.example.com/auth/google/callback');
  });
});
