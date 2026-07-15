import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),

  // Controls Fastify's `trustProxy` option, which governs how `request.ip`/`request.protocol`
  // are derived from X-Forwarded-For/X-Forwarded-Proto. Most deployments run behind a reverse
  // proxy (Cloudflare Tunnel, NGINX Proxy Manager, ...) that terminates TLS and forwards plain
  // HTTP to this container, so this defaults to "true" - trust the immediate hop unconditionally.
  // Set to "false" if the app is reachable directly with no proxy in front of it (those headers
  // would otherwise be spoofable by any client). Also accepts a hop count (number) or a specific
  // proxy IP/CIDR (or comma-separated list), passed straight through to Fastify for tighter setups.
  TRUST_PROXY: z
    .string()
    .optional()
    .default('true')
    .transform((v): boolean | number | string => {
      if (v === 'true') return true;
      if (v === 'false') return false;
      const n = Number(v);
      return Number.isNaN(n) || v.trim() === '' ? v : n;
    }),

  DEV_FAKE_AUTH: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // Generic OIDC provider (Authelia, Keycloak, Authentik, ...) - bring your own issuer.
  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
  OIDC_SCOPES: z.string().default('openid profile email'),

  // Google - also plain OIDC (fixed issuer), just its own named login button.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // Discord - OAuth2 only, no OIDC discovery/id_token, so it's handled separately from the above.
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_REDIRECT_URI: z.string().optional(),

  // Steam - legacy OpenID 2.0 (not OAuth2/OIDC at all). The API key is only used afterward, to
  // fetch a username/avatar for the verified SteamID via the Steam Web API.
  STEAM_API_KEY: z.string().optional(),
  STEAM_REDIRECT_URI: z.string().optional(),

  // Optional at the env layer: these three can also be supplied via the admin Settings panel as a
  // DB-stored fallback (see server/src/services/configResolver.ts) when .env doesn't set them. An
  // env var, when present, always wins over the DB value.
  GGDEALS_API_KEY: z.string().min(1).optional(),
  GGDEALS_DEFAULT_REGION: z.string().default('us'),

  IGDB_CLIENT_ID: z.string().min(1).optional(),
  IGDB_CLIENT_SECRET: z.string().min(1).optional(),

  // Comma-separated emails granted administrator access on login.
  ADMIN_EMAILS: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  if (parsed.data.DEV_FAKE_AUTH && process.env.NODE_ENV === 'production') {
    console.error(
      'DEV_FAKE_AUTH=true is set with NODE_ENV=production. This authenticates every request as a ' +
        'hardcoded dev user with no real access control - refusing to start. Unset DEV_FAKE_AUTH ' +
        'or configure a real sign-in provider.',
    );
    process.exit(1);
  }

  if (!parsed.data.DEV_FAKE_AUTH) {
    const data = parsed.data;
    const oidcReady = !!(data.OIDC_ISSUER_URL && data.OIDC_CLIENT_ID && data.OIDC_CLIENT_SECRET && data.OIDC_REDIRECT_URI);
    const googleReady = !!(data.GOOGLE_CLIENT_ID && data.GOOGLE_CLIENT_SECRET && data.GOOGLE_REDIRECT_URI);
    const discordReady = !!(data.DISCORD_CLIENT_ID && data.DISCORD_CLIENT_SECRET && data.DISCORD_REDIRECT_URI);
    const steamReady = !!(data.STEAM_API_KEY && data.STEAM_REDIRECT_URI);

    if (!oidcReady && !googleReady && !discordReady && !steamReady) {
      console.error(
        'No sign-in method is fully configured (generic OIDC, Google, Discord, and Steam are all incomplete). ' +
          'Set DEV_FAKE_AUTH=true for local dev without one, or finish configuring at least one provider.',
      );
      process.exit(1);
    }
  }

  return parsed.data;
}

export const env = loadEnv();
