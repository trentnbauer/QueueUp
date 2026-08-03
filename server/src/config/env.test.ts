import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveRedirectUris, envSchema, warnIfBasePathMismatchesAppBaseUrl, type Env } from './env.js';

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 3000,
    APP_BASE_URL: 'https://queueup.example.com',
    DATABASE_URL: 'postgresql://localhost/db',
    REDIS_URL: 'redis://localhost',
    SESSION_SECRET: 'test-secret-test-secret-test-secret',
    TRUST_PROXY: true,
    DEV_FAKE_AUTH: false,
    BASE_PATH: '',
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

describe('envSchema', () => {
  function baseProcessEnv(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      APP_BASE_URL: 'https://queueup.example.com',
      DATABASE_URL: 'postgresql://localhost/db',
      REDIS_URL: 'redis://localhost',
      SESSION_SECRET: 'test-secret-test-secret-test-secret',
      ...overrides,
    };
  }

  // docker-compose.prod.yml passes every optional credential through as `${VAR}` with no `:-`
  // default, so Compose substitutes an empty string (not "unset") when a self-hoster leaves one
  // blank in .env - this must parse the same as never setting it at all, not crash the container.
  it('treats an empty string the same as unset for optional credentials', () => {
    const result = envSchema.safeParse(
      baseProcessEnv({
        GGDEALS_API_KEY: '',
        IGDB_CLIENT_ID: '',
        IGDB_CLIENT_SECRET: '',
        SCANDEX_API_KEY: '',
        OIDC_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
        DISCORD_REDIRECT_URI: '',
        STEAM_API_KEY: '',
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.GGDEALS_API_KEY).toBeUndefined();
    expect(result.data.IGDB_CLIENT_ID).toBeUndefined();
    expect(result.data.IGDB_CLIENT_SECRET).toBeUndefined();
    expect(result.data.SCANDEX_API_KEY).toBeUndefined();
    expect(result.data.OIDC_CLIENT_ID).toBeUndefined();
    expect(result.data.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(result.data.DISCORD_REDIRECT_URI).toBeUndefined();
    expect(result.data.STEAM_API_KEY).toBeUndefined();
  });

  it('still accepts a real value for an optional credential', () => {
    const result = envSchema.safeParse(baseProcessEnv({ GGDEALS_API_KEY: 'a-real-key' }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.GGDEALS_API_KEY).toBe('a-real-key');
  });

  it('still rejects a genuinely missing required field', () => {
    const result = envSchema.safeParse({ APP_BASE_URL: 'https://queueup.example.com' });
    expect(result.success).toBe(false);
  });

  describe('BASE_PATH normalization', () => {
    it.each([
      [undefined, ''],
      ['', ''],
      ['/', ''],
      ['queueup', '/queueup'],
      ['/queueup', '/queueup'],
      ['/queueup/', '/queueup'],
      ['/a/b/', '/a/b'],
    ])('normalizes %j to %j', (input, expected) => {
      const result = envSchema.safeParse(baseProcessEnv(input === undefined ? {} : { BASE_PATH: input }));
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.BASE_PATH).toBe(expected);
    });
  });
});

describe('warnIfBasePathMismatchesAppBaseUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not warn when APP_BASE_URL has no path and BASE_PATH is unset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfBasePathMismatchesAppBaseUrl(baseEnv());
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when APP_BASE_URL and BASE_PATH describe the same sub-path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfBasePathMismatchesAppBaseUrl(baseEnv({ APP_BASE_URL: 'https://queueup.example.com/queueup', BASE_PATH: '/queueup' }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when APP_BASE_URL carries a path that BASE_PATH does not match', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfBasePathMismatchesAppBaseUrl(baseEnv({ APP_BASE_URL: 'https://queueup.example.com/queueup' }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('does not match'));
  });
});
