import { z } from 'zod';
import { type PriceRegion } from '@queueup/shared';

const PRICE_REGIONS: PriceRegion[] = ['us', 'gb', 'eu', 'au', 'ca', 'br'];

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
  // Defaults to `${APP_BASE_URL}/auth/oidc/callback` (see deriveRedirectUris below) - only set
  // this explicitly if the backend isn't reachable at APP_BASE_URL's origin (e.g. local dev's
  // split frontend/backend ports, or a reverse-proxy setup that routes the API to a different
  // host than the frontend).
  OIDC_REDIRECT_URI: z.string().optional(),
  OIDC_SCOPES: z.string().default('openid profile email'),

  // Google - also plain OIDC (fixed issuer), just its own named login button.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Defaults to `${APP_BASE_URL}/auth/google/callback` - see OIDC_REDIRECT_URI above.
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // Discord - OAuth2 only, no OIDC discovery/id_token, so it's handled separately from the above.
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  // Defaults to `${APP_BASE_URL}/auth/discord/callback` - see OIDC_REDIRECT_URI above.
  DISCORD_REDIRECT_URI: z.string().optional(),

  // Steam - legacy OpenID 2.0 (not OAuth2/OIDC at all). The API key is only used afterward, to
  // fetch a username/avatar for the verified SteamID via the Steam Web API.
  STEAM_API_KEY: z.string().optional(),
  // Defaults to `${APP_BASE_URL}/auth/steam/callback` - see OIDC_REDIRECT_URI above.
  STEAM_REDIRECT_URI: z.string().optional(),

  // Optional at the env layer: these three can also be supplied via the admin Settings panel as a
  // DB-stored fallback (see server/src/services/configResolver.ts) when .env doesn't set them. An
  // env var, when present, always wins over the DB value.
  GGDEALS_API_KEY: z.string().min(1).optional(),
  // gg.deals wants specific codes, not full ISO 3166-1 alpha-3 or every alpha-2 code (e.g. "uk"
  // 404s; it's "gb") - validated against the same closed list as PriceRegion (the per-request
  // region a user can pick) rather than left as a free-form string. Getting this wrong used to
  // fail silently: every price request would 400 against gg.deals, degrade to "unavailable", and
  // cache that failure for 6 hours - with nothing in the logs to explain why every single game on
  // the whole instance had no price.
  GGDEALS_DEFAULT_REGION: z.enum(PRICE_REGIONS as [PriceRegion, ...PriceRegion[]]).default('us'),

  IGDB_CLIENT_ID: z.string().min(1).optional(),
  IGDB_CLIENT_SECRET: z.string().min(1).optional(),

  // Comma-separated emails granted administrator access on login.
  ADMIN_EMAILS: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

// Every deployment this project documents (see docker-compose.prod.yml) runs one server process
// that serves both the API and the built frontend, so a provider's callback is reachable at
// APP_BASE_URL's own origin by construction - only the path differs, and that's fixed per
// provider. Filling that in here means .env only needs APP_BASE_URL plus each provider's
// credentials, not four more near-duplicate URLs the user would otherwise have to hand-write (and
// keep in sync if APP_BASE_URL ever changes). An explicit *_REDIRECT_URI still wins when set, for
// deployments where that assumption doesn't hold (e.g. local dev's split frontend/backend ports).
export function deriveRedirectUris(data: Env): Env {
  const base = data.APP_BASE_URL.replace(/\/+$/, '');
  return {
    ...data,
    OIDC_REDIRECT_URI: data.OIDC_REDIRECT_URI ?? `${base}/auth/oidc/callback`,
    GOOGLE_REDIRECT_URI: data.GOOGLE_REDIRECT_URI ?? `${base}/auth/google/callback`,
    DISCORD_REDIRECT_URI: data.DISCORD_REDIRECT_URI ?? `${base}/auth/discord/callback`,
    STEAM_REDIRECT_URI: data.STEAM_REDIRECT_URI ?? `${base}/auth/steam/callback`,
  };
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  parsed.data = deriveRedirectUris(parsed.data);

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
